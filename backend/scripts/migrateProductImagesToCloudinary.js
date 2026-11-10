const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { detectImageType } = require('../utils/detectImageType');

const storageDirectory = path.resolve(__dirname, '..', 'uploads', 'products');
const extensions = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
const backupMaxAgeMs = 24 * 60 * 60 * 1000;

function parseArguments(argv) {
  let apply = false;
  let backupPath;

  for (const argument of argv) {
    if (argument === '--apply') {
      if (apply) throw new Error('Specify --apply only once.');
      apply = true;
      continue;
    }

    if (argument.startsWith('--backup=')) {
      if (backupPath !== undefined) throw new Error('Specify --backup only once.');
      backupPath = argument.slice('--backup='.length);
      continue;
    }

    throw new Error(`Unknown migration argument: ${argument}`);
  }

  if (apply && !backupPath) {
    throw new Error('Apply mode requires --backup=/absolute/path/to/backup.sql.');
  }
  if (backupPath && !path.isAbsolute(backupPath)) {
    throw new Error('--backup must specify an absolute path to a SQL backup.');
  }

  return { apply, backupPath };
}

async function validateBackup(backupPath, now = Date.now()) {
  if (!backupPath || !path.isAbsolute(backupPath)) {
    throw new Error('--backup must specify an absolute path to a SQL backup.');
  }

  let stats;
  try {
    stats = await fsp.stat(backupPath);
  } catch {
    throw new Error('The specified SQL backup does not exist or cannot be accessed.');
  }
  if (!stats.isFile() || stats.size === 0) {
    throw new Error('The specified SQL backup must be a non-empty file.');
  }
  if (now - stats.mtimeMs > backupMaxAgeMs || stats.mtimeMs > now + 60_000) {
    throw new Error('The specified SQL backup must be no more than 24 hours old.');
  }

  const header = Buffer.alloc(Math.min(stats.size, 1024 * 1024));
  const tail = Buffer.alloc(Math.min(stats.size, 16 * 1024));
  const handle = await fsp.open(backupPath, 'r');
  try {
    await handle.read(header, 0, header.length, 0);
    await handle.read(tail, 0, tail.length, Math.max(0, stats.size - tail.length));
  } finally {
    await handle.close();
  }

  const headerText = header.toString('utf8');
  if (!/^-- MySQL dump\b/im.test(headerText)) {
    throw new Error('The specified file does not contain a MySQL dump header.');
  }

  const ending = tail.toString('utf8').trimEnd();
  if (!/-- Dump completed on .+$/.test(ending)) {
    throw new Error('The specified MySQL dump is missing its completion marker.');
  }

  let hasProductImagesDefinition = false;
  let hasProductImagesInsert = false;
  let carry = '';
  const tableName = '(?:`product_images`|product_images)(?=\\s|\\()';
  const createTablePattern = new RegExp(
    `\\bCREATE\\s+TABLE(?:\\s+IF\\s+NOT\\s+EXISTS)?\\s+${tableName}`,
    'i',
  );
  const insertPattern = new RegExp(`\\bINSERT\\s+INTO\\s+${tableName}`, 'i');

  for await (const chunk of fs.createReadStream(backupPath)) {
    const text = carry + chunk.toString('utf8');
    hasProductImagesDefinition ||= createTablePattern.test(text);
    hasProductImagesInsert ||= insertPattern.test(text);
    if (hasProductImagesDefinition && hasProductImagesInsert) break;
    carry = text.slice(-128);
  }

  if (!hasProductImagesDefinition) {
    throw new Error('The specified MySQL dump does not contain product_images CREATE TABLE definition.');
  }
  if (!hasProductImagesInsert) {
    throw new Error('The specified MySQL dump does not contain an INSERT INTO statement for product_images.');
  }

  return { path: backupPath, sizeBytes: stats.size, modifiedAt: stats.mtime.toISOString() };
}

function getConfig() {
  const config = {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME?.trim(),
    apiKey: process.env.CLOUDINARY_API_KEY?.trim(),
    apiSecret: process.env.CLOUDINARY_API_SECRET?.trim(),
  };

  if (!config.cloudName || !config.apiKey || !config.apiSecret) {
    throw new Error('Cloudinary configuration is incomplete.');
  }

  if (!/^[a-z0-9-]+$/i.test(config.cloudName)) {
    throw new Error('Invalid Cloudinary cloud name.');
  }

  return config;
}

function signParams(params, secret) {
  const serialized = Object.entries(params)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('&');

  return crypto
    .createHash('sha1')
    .update(`${serialized}${secret}`)
    .digest('hex');
}

function deterministicPublicId(imageId, sellerId, filename) {
  const hash = crypto
    .createHash('sha256')
    .update(`jimvolt-product-image:${sellerId}:${imageId}:${filename}`)
    .digest('hex')
    .slice(0, 32);

  const uuid = [
    hash.slice(0, 8),
    hash.slice(8, 12),
    hash.slice(12, 16),
    hash.slice(16, 20),
    hash.slice(20, 32),
  ].join('-');

  return `user_${sellerId}/${uuid}`;
}

function validateCloudinaryUrl(url, publicId, extension, cloudName) {
  try {
    const parsed = new URL(url);

    if (
      parsed.protocol !== 'https:' ||
      parsed.hostname !== 'res.cloudinary.com' ||
      parsed.search ||
      parsed.hash
    ) return false;

    const prefix = `/${cloudName}/image/upload/`;

    if (!parsed.pathname.startsWith(prefix)) return false;

    const resource = parsed.pathname
      .slice(prefix.length)
      .replace(/^v\d+\//, '');

    return resource === `jimvolt/products/${publicId}.${extension}`;
  } catch {
    return false;
  }
}

class DatabaseCommitOutcomeUnknownError extends Error {
  constructor({ imageId, stage, cause, rollbackError }) {
    const message = stage === 'rollback'
      ? `Database transaction outcome is unknown for image ${imageId}: rollback failed. Manual reconciliation is required.`
      : `Database transaction outcome is unknown for image ${imageId}: COMMIT failed. Manual reconciliation is required.`;
    super(message, { cause });
    this.name = 'DatabaseCommitOutcomeUnknownError';
    this.imageId = String(imageId);
    this.stage = stage;
    this.outcomeUnknown = true;
    if (rollbackError) this.rollbackError = rollbackError;
  }
}

function inspectCandidate(row) {
  const parsed = new URL(row.image_url, 'http://localhost');

  if (
    parsed.origin !== 'http://localhost' ||
    !parsed.pathname.startsWith('/uploads/products/')
  ) {
    throw new Error(`Image ${row.image_id}: unexpected local image URL.`);
  }

  const filename = path.basename(parsed.pathname);

  if (
    parsed.pathname !== `/uploads/products/${filename}` ||
    !/^[a-f0-9-]{36}\.(jpg|png|webp)$/i.test(filename)
  ) {
    throw new Error(`Image ${row.image_id}: unsafe filename.`);
  }

  const filepath = path.join(storageDirectory, filename);

  if (!fs.existsSync(filepath)) {
    throw new Error(`Image ${row.image_id}: original file is missing.`);
  }

  const stats = fs.statSync(filepath);

  if (!stats.isFile() || stats.size === 0 || stats.size > 5 * 1024 * 1024) {
    throw new Error(`Image ${row.image_id}: invalid file size.`);
  }

  const buffer = fs.readFileSync(filepath);
  const mimeType = detectImageType(buffer);
  const extension = extensions[mimeType];

  if (!extension || filename.split('.').pop().toLowerCase() !== extension) {
    throw new Error(`Image ${row.image_id}: image signature/extension mismatch.`);
  }

  const imageId = String(row.image_id);
  const sellerId = String(row.seller_id);
  const publicId = deterministicPublicId(imageId, sellerId, filename);

  return {
    imageId,
    advertisementId: String(row.advertisement_id),
    sellerId,
    oldUrl: row.image_url,
    filename,
    filepath,
    sizeBytes: stats.size,
    mimeType,
    extension,
    buffer,
    publicId,
  };
}

async function uploadToCloudinary(item, config) {
  const timestamp = String(Math.floor(Date.now() / 1000));

  const params = {
    folder: 'jimvolt/products',
    public_id: item.publicId,
    timestamp,
    overwrite: 'true',
  };

  const form = new FormData();

  form.append(
    'file',
    new Blob([item.buffer], { type: item.mimeType }),
    item.filename
  );

  form.append('api_key', config.apiKey);

  for (const [key, value] of Object.entries(params)) {
    form.append(key, value);
  }

  form.append('signature', signParams(params, config.apiSecret));

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${config.cloudName}/image/upload`,
    {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(60000),
    }
  );

  if (!response.ok) {
    throw new Error(`Cloudinary upload failed for image ${item.imageId} (HTTP ${response.status}).`);
  }

  const result = await response.json();

  if (
    result.public_id !== item.publicId ||
    !validateCloudinaryUrl(
      result.secure_url,
      item.publicId,
      item.extension,
      config.cloudName
    )
  ) {
    throw new Error(`Cloudinary verification failed for image ${item.imageId}.`);
  }

  return result.secure_url;
}

async function updateDatabase(pool, item, cloudinaryUrl) {
  const connection = await pool.getConnection();
  let transactionStarted = false;
  let discardConnection = false;

  try {
    await connection.beginTransaction();
    transactionStarted = true;

    const [currentRows] = await connection.execute(
      `SELECT pi.image_url, a.user_id AS seller_id
       FROM product_images pi
       JOIN advertisements a ON a.id = pi.advertisement_id
       WHERE pi.id = ?
       FOR UPDATE`,
      [item.imageId]
    );

    if (
      !currentRows.length ||
      currentRows[0].image_url !== item.oldUrl ||
      String(currentRows[0].seller_id) !== item.sellerId
    ) {
      throw new Error(
        `Image ${item.imageId} changed during migration. Database update cancelled.`
      );
    }

    const [updateResult] = await connection.execute(
      `UPDATE product_images
       SET image_url = ?
       WHERE id = ? AND advertisement_id = ? AND image_url = ?`,
      [cloudinaryUrl, item.imageId, item.advertisementId, item.oldUrl]
    );

    if (updateResult.affectedRows !== 1) {
      throw new Error(`Could not update image record ${item.imageId}.`);
    }

    await connection.execute(
      `UPDATE favourites
       SET saved_image = ?
       WHERE advertisement_id = ? AND saved_image = ?`,
      [cloudinaryUrl, item.advertisementId, item.oldUrl]
    );

    try {
      await connection.commit();
      transactionStarted = false;
    } catch (commitError) {
      discardConnection = true;
      try {
        await connection.rollback();
        transactionStarted = false;
      } catch (rollbackError) {
        throw new DatabaseCommitOutcomeUnknownError({
          imageId: item.imageId,
          stage: 'rollback',
          cause: commitError,
          rollbackError,
        });
      }
      throw new DatabaseCommitOutcomeUnknownError({
        imageId: item.imageId,
        stage: 'commit',
        cause: commitError,
      });
    }
  } catch (error) {
    if (error instanceof DatabaseCommitOutcomeUnknownError) throw error;
    if (transactionStarted) {
      try {
        await connection.rollback();
        transactionStarted = false;
      } catch (rollbackError) {
        discardConnection = true;
        throw new DatabaseCommitOutcomeUnknownError({
          imageId: item.imageId,
          stage: 'rollback',
          cause: error,
          rollbackError,
        });
      }
    }
    throw error;
  } finally {
    if (discardConnection) connection.destroy();
    else connection.release();
  }
}

async function writeAuditAtomically(auditFile, audit) {
  const temporaryFile = `${auditFile}.${process.pid}.${crypto.randomUUID()}.tmp`;
  let handle;

  try {
    handle = await fsp.open(temporaryFile, 'wx', 0o600);
    await handle.writeFile(`${JSON.stringify(audit, null, 2)}\n`, 'utf8');
    await handle.sync();
    await handle.close();
    handle = undefined;
    await fsp.rename(temporaryFile, auditFile);
  } catch (error) {
    if (handle) await handle.close().catch(() => {});
    await fsp.unlink(temporaryFile).catch((cleanupError) => {
      if (cleanupError.code !== 'ENOENT') console.error('Could not remove temporary audit file:', cleanupError.message);
    });
    throw error;
  }
}

function createAuditFilePath(backupPath, now = new Date()) {
  const timestamp = now.toISOString().replace(/[:.]/g, '-');
  return path.join(
    path.dirname(backupPath),
    `cloudinary-migration-${timestamp}-${crypto.randomUUID()}.json`
  );
}

class AuditPersistenceError extends Error {
  constructor(stage, cause) {
    super(`Could not persist the migration audit during ${stage}: ${cause.message}`, { cause });
    this.name = 'AuditPersistenceError';
    this.stage = stage;
  }
}

function migrationDependencies(overrides = {}) {
  return {
    getPool: () => require('../config/database').pool,
    getConfig,
    validateBackup,
    inspectCandidate,
    uploadToCloudinary,
    updateDatabase,
    writeAuditAtomically,
    createAuditFilePath,
    log: console.log,
    error: console.error,
    warn: console.warn,
    ...overrides,
  };
}

async function main(argv = process.argv.slice(2), injectedDependencies = {}) {
  const dependencies = migrationDependencies(injectedDependencies);
  let pool;

  try {
    const { apply, backupPath } = parseArguments(argv);

    console.log('\n======================================');
    console.log(' JIMVOLT CLOUDINARY IMAGE MIGRATION');
    console.log('======================================');
    console.log('Mode:', apply ? 'APPLY' : 'DRY-RUN');

    let backup;
    let config;
    if (apply) {
      backup = await dependencies.validateBackup(backupPath);
      config = dependencies.getConfig();
      dependencies.log(`Validated database backup: ${backup.path} (${backup.sizeBytes} bytes).`);
    }

    pool = injectedDependencies.pool || await dependencies.getPool();
    const [rows] = await pool.execute(`
      SELECT
        pi.id AS image_id,
        pi.advertisement_id,
        a.user_id AS seller_id,
        pi.image_url
      FROM product_images pi
      JOIN advertisements a ON a.id = pi.advertisement_id
      WHERE pi.image_url LIKE '%/uploads/products/%'
      ORDER BY pi.id
    `);

    if (!rows.length) {
      dependencies.log('\nNo local product images need migration.');
      return { apply, candidates: 0, failures: 0 };
    }

    const candidates = rows.map(dependencies.inspectCandidate);
    dependencies.log(`\nFound ${candidates.length} migration candidates.`);

    for (const item of candidates) {
      dependencies.log({
        imageId: item.imageId,
        advertisementId: item.advertisementId,
        sellerId: item.sellerId,
        filename: item.filename,
        sizeBytes: item.sizeBytes,
        publicId: item.publicId,
        status: 'VALID',
      });
    }

    if (!apply) {
      dependencies.log('\nDRY-RUN SUCCESSFUL.');
      dependencies.log('No uploads were performed.');
      dependencies.log('No database records were changed.');
      dependencies.log('Original image files were untouched.');
      dependencies.log('\nTo authorize the actual migration later, use --apply.');
      return { apply: false, candidates: candidates.length, failures: 0 };
    }

    const auditFile = dependencies.createAuditFilePath(backupPath);
    const audit = {
      version: 1,
      createdAt: new Date().toISOString(),
      mode: 'APPLY',
      backup,
      items: candidates.map((item) => ({
        imageId: item.imageId,
        advertisementId: item.advertisementId,
        sellerId: item.sellerId,
        oldUrl: item.oldUrl,
        publicId: item.publicId,
        status: 'PENDING',
      })),
    };

    try {
      await dependencies.writeAuditAtomically(auditFile, audit);
    } catch (error) {
      throw new AuditPersistenceError('initialization', error);
    }
    dependencies.log('\nAudit log created:', auditFile);
    dependencies.log('\nStarting Cloudinary uploads...');

    let failures = 0;
    let stoppedForDatabaseReview = false;
    for (const [index, item] of candidates.entries()) {
      const record = audit.items[index];
      dependencies.log(`\nProcessing image ${item.imageId}...`);

      let cloudinaryUrl;
      try {
        cloudinaryUrl = await dependencies.uploadToCloudinary(item, config);
      } catch (error) {
        failures += 1;
        record.status = 'FAILED';
        record.failureType = 'CLOUDINARY_UPLOAD';
        record.error = error.message;
        record.failedAt = new Date().toISOString();
        try {
          await dependencies.writeAuditAtomically(auditFile, audit);
        } catch (auditError) {
          throw new AuditPersistenceError('recording Cloudinary upload failure', auditError);
        }
        dependencies.error(`Cloudinary upload failed for image ${item.imageId}:`, error.message);
        continue;
      }

      record.newUrl = cloudinaryUrl;
      record.uploadedAt = new Date().toISOString();
      record.status = 'UPLOADED';
      try {
        await dependencies.writeAuditAtomically(auditFile, audit);
      } catch (error) {
        throw new AuditPersistenceError(`recording Cloudinary upload for image ${item.imageId}`, error);
      }
      dependencies.log('Cloudinary upload verified and recorded.');

      try {
        await dependencies.updateDatabase(pool, item, cloudinaryUrl);
      } catch (error) {
        failures += 1;
        const outcomeUnknown = error instanceof DatabaseCommitOutcomeUnknownError
          || error.outcomeUnknown === true;
        record.status = outcomeUnknown ? 'DATABASE_OUTCOME_UNKNOWN' : 'FAILED';
        record.failureType = outcomeUnknown
          ? error.stage === 'rollback'
            ? 'DATABASE_ROLLBACK_OUTCOME_UNKNOWN'
            : 'DATABASE_COMMIT_OUTCOME_UNKNOWN'
          : 'DATABASE_UPDATE';
        record.error = error.message;
        if (error.cause) record.databaseError = error.cause.message;
        record.reviewRequiredAt = new Date().toISOString();
        if (error.stage) record.databaseFailureStage = error.stage;
        if (error.rollbackError) record.rollbackError = error.rollbackError.message;
        dependencies.warn(
          outcomeUnknown
            ? `DATABASE WARNING: The transaction outcome is unknown for image ${item.imageId}. Inspect product_images in MySQL before retrying. The Cloudinary URL and audit history have been preserved.`
            : `DATABASE WARNING: The update failed for image ${item.imageId}. Inspect product_images in MySQL before retrying. The Cloudinary URL and audit history have been preserved.`,
        );
        try {
          await dependencies.writeAuditAtomically(auditFile, audit);
        } catch (auditError) {
          throw new AuditPersistenceError(`recording database update failure for image ${item.imageId}`, auditError);
        }
        dependencies.error(`Database migration stopped at image ${item.imageId}:`, error.message);
        stoppedForDatabaseReview = true;
        break;
      }

      record.status = 'DATABASE_UPDATED';
      record.migratedAt = new Date().toISOString();
      try {
        await dependencies.writeAuditAtomically(auditFile, audit);
      } catch (error) {
        dependencies.warn(
          `AUDIT WARNING: The database may already contain the Cloudinary URL for image ${item.imageId}, but the audit update could not be saved. Stop and reconcile the database and audit before retrying.`,
        );
        throw new AuditPersistenceError(`recording committed database update for image ${item.imageId}`, error);
      }
      dependencies.log('Database updated successfully.');
    }

    dependencies.log('\n======================================');
    dependencies.log(failures ? ' MIGRATION COMPLETED WITH ERRORS' : ' MIGRATION COMPLETED');
    dependencies.log('======================================');
    dependencies.log('Images updated:', audit.items.filter((item) => item.status === 'DATABASE_UPDATED').length);
    dependencies.log('Images failed:', failures);
    dependencies.log('Audit log:', auditFile);
    dependencies.log('Original local images were preserved.');

    if (failures) {
      dependencies.error('Review FAILED entries in the audit log. Re-running is safe; Cloudinary public IDs are deterministic.');
    }
    return {
      apply: true,
      candidates: candidates.length,
      failures,
      stoppedForDatabaseReview,
      auditFile,
      audit,
    };
  } finally {
    await pool?.end();
  }
}

if (require.main === module) {
  main().then((result) => {
    if (result?.failures) process.exitCode = 1;
  }).catch((error) => {
    console.error('\nMIGRATION FAILED:', error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  createAuditFilePath,
  DatabaseCommitOutcomeUnknownError,
  deterministicPublicId,
  main,
  parseArguments,
  updateDatabase,
  validateBackup,
  writeAuditAtomically,
};
