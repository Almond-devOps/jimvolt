const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const {
  DatabaseCommitOutcomeUnknownError,
  deterministicPublicId,
  main,
  updateDatabase,
  validateBackup,
} = require('../scripts/migrateProductImagesToCloudinary')

const createTable = `CREATE TABLE \`product_images\` (
  \`id\` bigint unsigned NOT NULL AUTO_INCREMENT,
  \`advertisement_id\` bigint unsigned NOT NULL,
  \`image_url\` varchar(2048) NOT NULL,
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB;`
const insertRows = `INSERT INTO \`product_images\` VALUES (101,9,'/uploads/products/01234567-89ab-cdef-0123-456789abcdef.png');`

async function withTemporaryDirectory(callback) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'jimvolt-product-migration-'))
  try {
    await callback(directory)
  } finally {
    await fs.rm(directory, { recursive: true, force: true })
  }
}

async function writeBackup(directory, contents = `${createTable}\n${insertRows}`) {
  const backupPath = path.join(directory, 'backup.sql')
  await fs.writeFile(
    backupPath,
    `-- MySQL dump 10.13 Distrib 8.0.36\n${contents}\n-- Dump completed on 2026-11-09 12:00:00\n`,
  )
  return backupPath
}

function fakePool(rows, updates = []) {
  return {
    async execute() {
      return [rows]
    },
    async getConnection() {
      return {
        async beginTransaction() {},
        async execute(sql) {
          updates.push(sql)
          if (sql.includes('SELECT pi.image_url')) {
            return [[{ image_url: rows[0].image_url, seller_id: rows[0].seller_id }]]
          }
          return [{ affectedRows: 1 }]
        },
        async commit() {},
        async rollback() {},
        release() {},
      }
    },
    async end() {},
  }
}

function migrationRow() {
  return {
    image_id: 101,
    advertisement_id: 9,
    seller_id: 22,
    image_url: '/uploads/products/01234567-89ab-cdef-0123-456789abcdef.png',
  }
}

function candidate(row) {
  return {
    imageId: String(row.image_id),
    advertisementId: String(row.advertisement_id),
    sellerId: String(row.seller_id),
    oldUrl: row.image_url,
    filename: '01234567-89ab-cdef-0123-456789abcdef.png',
    sizeBytes: 68,
    publicId: deterministicPublicId(row.image_id, row.seller_id, '01234567-89ab-cdef-0123-456789abcdef.png'),
    buffer: Buffer.from('mock image'),
    mimeType: 'image/png',
    extension: 'png',
  }
}

function runtime(overrides = {}) {
  const messages = []
  const dependencies = {
    pool: fakePool([migrationRow()]),
    inspectCandidate: (row) => candidate(row),
    uploadToCloudinary: async () => 'https://res.cloudinary.com/jimvolt/image/upload/v1/jimvolt/products/user_22/test.png',
    updateDatabase: async () => {},
    writeAuditAtomically: async () => {},
    createAuditFilePath: () => '/tmp/jimvolt-test-audit.json',
    getConfig: () => ({ cloudName: 'jimvolt', apiKey: 'key', apiSecret: 'secret' }),
    log: (...args) => messages.push(args.join(' ')),
    error: (...args) => messages.push(args.join(' ')),
    warn: (...args) => messages.push(args.join(' ')),
    ...overrides,
  }
  return { dependencies, messages }
}

function transactionPool({ image = migrationRow(), updateError, commitError, rollbackError } = {}) {
  const calls = []
  const connection = {
    async beginTransaction() {
      calls.push('begin')
    },
    async execute(sql) {
      calls.push(sql)
      if (sql.includes('SELECT pi.image_url')) {
        return [[{ image_url: image.image_url, seller_id: image.seller_id }]]
      }
      if (sql.includes('UPDATE product_images') && updateError) throw updateError
      return [{ affectedRows: 1 }]
    },
    async commit() {
      calls.push('commit')
      if (commitError) throw commitError
    },
    async rollback() {
      calls.push('rollback')
      if (rollbackError) throw rollbackError
    },
    release() {
      calls.push('release')
    },
    destroy() {
      calls.push('destroy')
    },
  }
  return {
    calls,
    pool: { getConnection: async () => connection },
  }
}

test('accepts a recent MySQL dump with product_images definition and insert data', async () => {
  await withTemporaryDirectory(async (directory) => {
    const backupPath = await writeBackup(directory)
    const backup = await validateBackup(backupPath)
    assert.equal(backup.path, backupPath)
  })
})

test('rejects a dump without a product_images table definition', async () => {
  await withTemporaryDirectory(async (directory) => {
    const backupPath = await writeBackup(directory, 'CREATE TABLE `other_table` (`id` int);')
    await assert.rejects(validateBackup(backupPath), /product_images.*CREATE TABLE/i)
  })
})

test('rejects a dump without product_images insert data', async () => {
  await withTemporaryDirectory(async (directory) => {
    const backupPath = await writeBackup(directory, createTable)
    await assert.rejects(validateBackup(backupPath), /INSERT INTO.*product_images/i)
  })
})

test('rejects a MySQL backup older than 24 hours', async () => {
  await withTemporaryDirectory(async (directory) => {
    const backupPath = await writeBackup(directory)
    const old = new Date(Date.now() - 25 * 60 * 60 * 1000)
    await fs.utimes(backupPath, old, old)
    await assert.rejects(validateBackup(backupPath), /24 hours/)
  })
})

test('creates the initial audit before attempting any upload and aborts on audit failure', async () => {
  await withTemporaryDirectory(async (directory) => {
    const backupPath = await writeBackup(directory)
    let uploads = 0
    const { dependencies } = runtime({
      writeAuditAtomically: async () => { throw new Error('audit disk unavailable') },
      uploadToCloudinary: async () => { uploads += 1 },
    })
    await assert.rejects(main(['--apply', `--backup=${backupPath}`], dependencies), /audit disk unavailable/)
    assert.equal(uploads, 0)
  })
})

test('stops the migration when persisting a Cloudinary upload result fails', async () => {
  await withTemporaryDirectory(async (directory) => {
    const backupPath = await writeBackup(directory)
    let auditWrites = 0
    let uploads = 0
    let databaseUpdates = 0
    const { dependencies } = runtime({
      pool: fakePool([migrationRow(), { ...migrationRow(), image_id: 102 }]),
      writeAuditAtomically: async () => {
        auditWrites += 1
        if (auditWrites === 2) throw new Error('upload result audit failed')
      },
      uploadToCloudinary: async () => {
        uploads += 1
        return 'https://res.cloudinary.com/jimvolt/image/upload/v1/jimvolt/products/user_22/test.png'
      },
      updateDatabase: async () => { databaseUpdates += 1 },
    })
    await assert.rejects(main(['--apply', `--backup=${backupPath}`], dependencies), /upload result audit failed/)
    assert.equal(uploads, 1)
    assert.equal(databaseUpdates, 0)
  })
})

test('stops after database commit if the committed state cannot be persisted to the audit', async () => {
  await withTemporaryDirectory(async (directory) => {
    const backupPath = await writeBackup(directory)
    let auditWrites = 0
    let uploads = 0
    let databaseUpdates = 0
    const { dependencies, messages } = runtime({
      pool: fakePool([migrationRow(), { ...migrationRow(), image_id: 102 }]),
      writeAuditAtomically: async () => {
        auditWrites += 1
        if (auditWrites === 3) throw new Error('post-commit audit failed')
      },
      uploadToCloudinary: async () => {
        uploads += 1
        return 'https://res.cloudinary.com/jimvolt/image/upload/v1/jimvolt/products/user_22/test.png'
      },
      updateDatabase: async () => { databaseUpdates += 1 },
    })
    await assert.rejects(main(['--apply', `--backup=${backupPath}`], dependencies), /post-commit audit failed/)
    assert.equal(uploads, 1)
    assert.equal(databaseUpdates, 1)
    assert.match(messages.join('\n'), /database may already contain the Cloudinary URL/i)
  })
})

test('uses the same deterministic Cloudinary public ID when retrying an image', () => {
  const filename = '01234567-89ab-cdef-0123-456789abcdef.png'
  assert.equal(deterministicPublicId('101', '22', filename), 'user_22/d32e2e24-1281-e107-6eda-f6f02bbb50b2')
  assert.equal(
    deterministicPublicId('101', '22', filename),
    deterministicPublicId('101', '22', filename),
  )
})

test('dry-run does not upload, update the database, or write an audit', async () => {
  await withTemporaryDirectory(async (directory) => {
    let uploads = 0
    let databaseUpdates = 0
    let auditWrites = 0
    const { dependencies } = runtime({
      uploadToCloudinary: async () => { uploads += 1 },
      updateDatabase: async () => { databaseUpdates += 1 },
      writeAuditAtomically: async () => { auditWrites += 1 },
    })
    const result = await main([], dependencies)
    assert.deepEqual(result, { apply: false, candidates: 1, failures: 0 })
    assert.deepEqual([uploads, databaseUpdates, auditWrites], [0, 0, 0])
  })
})

test('failed COMMIT produces an identifiable uncertain outcome and discards the connection', async () => {
  const commitError = new Error('connection lost during COMMIT')
  const { pool, calls } = transactionPool({ commitError })
  const item = candidate(migrationRow())

  await assert.rejects(
    updateDatabase(pool, item, 'https://res.cloudinary.com/jimvolt/image/upload/image.png'),
    (error) => {
      assert.ok(error instanceof DatabaseCommitOutcomeUnknownError)
      assert.equal(error.stage, 'commit')
      assert.equal(error.cause, commitError)
      return true
    },
  )
  assert.deepEqual(calls.slice(-3), ['commit', 'rollback', 'destroy'])
  assert.equal(calls.includes('release'), false)
})

test('failed rollback preserves both errors and discards the unsafe connection', async () => {
  const updateError = new Error('product image update failed')
  const rollbackError = new Error('rollback failed')
  const { pool, calls } = transactionPool({ updateError, rollbackError })
  const item = candidate(migrationRow())

  await assert.rejects(
    updateDatabase(pool, item, 'https://res.cloudinary.com/jimvolt/image/upload/image.png'),
    (error) => {
      assert.ok(error instanceof DatabaseCommitOutcomeUnknownError)
      assert.equal(error.stage, 'rollback')
      assert.equal(error.cause, updateError)
      assert.equal(error.rollbackError, rollbackError)
      return true
    },
  )
  assert.equal(calls.at(-1), 'destroy')
  assert.equal(calls.includes('release'), false)
})

test('ordinary database update errors stop before processing the next image', async () => {
  await withTemporaryDirectory(async (directory) => {
    const backupPath = await writeBackup(directory)
    let uploads = 0
    let databaseUpdates = 0
    const { dependencies } = runtime({
      pool: fakePool([migrationRow(), { ...migrationRow(), image_id: 102 }]),
      uploadToCloudinary: async () => {
        uploads += 1
        return 'https://res.cloudinary.com/jimvolt/image/upload/v1/jimvolt/products/user_22/test.png'
      },
      updateDatabase: async () => {
        databaseUpdates += 1
        throw new Error('database update rejected')
      },
    })

    const result = await main(['--apply', `--backup=${backupPath}`], dependencies)
    assert.equal(result.stoppedForDatabaseReview, true)
    assert.equal(uploads, 1)
    assert.equal(databaseUpdates, 1)
    assert.equal(result.audit.items[0].status, 'FAILED')
    assert.equal(result.audit.items[1].status, 'PENDING')
  })
})

test('uncertain COMMIT stops migration and retains upload URL and reconciliation details', async () => {
  await withTemporaryDirectory(async (directory) => {
    const backupPath = await writeBackup(directory)
    const image = migrationRow()
    const commitError = new Error('connection lost during COMMIT')
    const { pool: connectionPool } = transactionPool({ image, commitError })
    let uploads = 0
    let databaseUpdates = 0
    const persistedAudits = []
    const { dependencies, messages } = runtime({
      pool: {
        ...fakePool([image, { ...image, image_id: 102 }]),
        getConnection: connectionPool.getConnection,
      },
      uploadToCloudinary: async () => {
        uploads += 1
        return 'https://res.cloudinary.com/jimvolt/image/upload/v1/jimvolt/products/user_22/image-101.png'
      },
      updateDatabase: async (...args) => {
        databaseUpdates += 1
        return updateDatabase(...args)
      },
      writeAuditAtomically: async (_auditFile, audit) => {
        persistedAudits.push(JSON.parse(JSON.stringify(audit)))
      },
    })

    const result = await main(['--apply', `--backup=${backupPath}`], dependencies)
    const item = result.audit.items[0]
    assert.equal(result.stoppedForDatabaseReview, true)
    assert.equal(uploads, 1)
    assert.equal(databaseUpdates, 1)
    assert.equal(item.status, 'DATABASE_OUTCOME_UNKNOWN')
    assert.equal(item.failureType, 'DATABASE_COMMIT_OUTCOME_UNKNOWN')
    assert.equal(item.oldUrl, image.image_url)
    assert.equal(item.newUrl, 'https://res.cloudinary.com/jimvolt/image/upload/v1/jimvolt/products/user_22/image-101.png')
    assert.equal(item.databaseError, 'connection lost during COMMIT')
    assert.equal(persistedAudits.at(-1).items[0].status, 'DATABASE_OUTCOME_UNKNOWN')
    assert.equal(persistedAudits.at(-1).items[0].newUrl, item.newUrl)
    assert.equal(persistedAudits.at(-1).items[0].oldUrl, item.oldUrl)
    assert.match(messages.join('\n'), /inspect product_images in MySQL before retrying/i)
  })
})
