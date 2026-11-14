const fs = require('node:fs/promises')
const fsSync = require('node:fs')
const path = require('node:path')
const mysql = require('mysql2/promise')
const { withSchemaLock } = require('../utils/schemaLock')
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') })

const requiredVariables = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME']
const missingVariables = requiredVariables.filter((name) => process.env[name] === undefined)
if (missingVariables.length) {
  throw new Error(`Missing database configuration: ${missingVariables.join(', ')}`)
}
if (!process.env.DB_NAME) {
  throw new Error('DB_NAME must be configured.')
}
if (process.env.DB_USER.toLowerCase() === 'root') {
  throw new Error('Configure DB_USER with the dedicated Jimvolt MySQL application account, not root.')
}

const isLocalDatabase = ['localhost', '127.0.0.1', '::1'].includes(process.env.DB_HOST.toLowerCase())
const sslCaSetting = process.env.DB_SSL_CA?.trim()
if (!isLocalDatabase && !sslCaSetting) {
  throw new Error('DB_SSL_CA must point to the Aiven CA certificate when using a remote MySQL database.')
}

let ssl
if (sslCaSetting) {
  const sslCaPath = path.resolve(__dirname, '..', sslCaSetting)
  try {
    ssl = {
      ca: fsSync.readFileSync(sslCaPath, 'utf8'),
      rejectUnauthorized: true,
    }
  } catch (error) {
    throw new Error(`Could not read the configured DB_SSL_CA certificate at ${sslCaPath}: ${error.message}`)
  }
}

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: Number(process.env.DB_PORT || 3306),
  connectTimeout: 10000,
  waitForConnections: true,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  connectionLimit: 10,
  queueLimit: 50,
  charset: 'utf8mb4',
  ...(ssl ? { ssl } : {}),
})

async function connectDB() {
  const connection = await pool.getConnection()
  try {
    const [rows] = await connection.query(
      'SELECT DATABASE() AS database_name',
    )
    if (rows[0].database_name !== process.env.DB_NAME) {
      throw new Error('Connected to an unexpected MySQL database.')
    }
    console.log(`MySQL connected: ${rows[0].database_name}`)
  } finally {
    connection.release()
  }
}

async function ensureCoreSchema() {
  return withSchemaLock(pool, process.env.DB_NAME, initializeCoreSchema)
}

async function initializeCoreSchema(pool) {
  const schemaPath = path.join(__dirname, 'schema.sql')
  const schema = await fs.readFile(schemaPath, 'utf8')
  const createStatements = schema
    .split(';')
    .map((statement) => statement.trim())
    .filter((statement) => /^CREATE TABLE IF NOT EXISTS\s+/i.test(statement))

  if (!createStatements.length) {
    throw new Error('No safe CREATE TABLE IF NOT EXISTS statements found in config/schema.sql.')
  }

  for (const statement of createStatements) {
    await pool.query(statement)
  }

  const defaultPackages = [
    ['Boost', 'A short campaign to give an approved listing extra visibility.', 2000, 3, 'Featured placement for 3 days'],
    ['Featured', 'A week of sponsored visibility for an approved listing.', 5000, 7, 'Featured placement for 7 days'],
    ['Premium', 'Two weeks of premium marketplace visibility.', 9000, 14, 'Featured placement for 14 days'],
    ['Premium Plus', 'A full month of premium marketplace visibility.', 15000, 30, 'Featured placement for 30 days'],
  ]
  for (const [name, description, price, durationDays, benefits] of defaultPackages) {
    const [equivalentPackages] = await pool.execute(
      `SELECT id FROM promotion_packages
       WHERE price = ? AND duration_days = ? AND is_active = TRUE LIMIT 1`,
      [price, durationDays],
    )
    if (!equivalentPackages.length) {
      await pool.execute(
        `INSERT IGNORE INTO promotion_packages (name, description, price, duration_days, benefits)
         VALUES (?, ?, ?, ?, ?)`,
        [name, description, price, durationDays, benefits],
      )
    }
  }

  const [favoriteColumns] = await pool.query('SHOW COLUMNS FROM favourites')
  const favoriteColumnNames = new Set(favoriteColumns.map((column) => column.Field))
  for (const [name, definition] of [
    ['saved_title', 'VARCHAR(180) NULL'],
    ['saved_price', 'DECIMAL(13, 2) NULL'],
    ['saved_condition_type', "ENUM('new', 'used') NULL"],
    ['saved_state', 'VARCHAR(100) NULL'],
    ['saved_city', 'VARCHAR(120) NULL'],
    ['saved_image', 'VARCHAR(2048) NULL'],
    ['saved_seller_name', 'VARCHAR(120) NULL'],
    ['saved_category_id', 'BIGINT UNSIGNED NULL'],
  ]) {
    if (!favoriteColumnNames.has(name)) {
      await pool.query(`ALTER TABLE favourites ADD COLUMN \`${name}\` ${definition}`)
    }
  }
  const [favoriteAdConstraints] = await pool.query(
    `SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'favourites'
       AND COLUMN_NAME = 'advertisement_id' AND REFERENCED_TABLE_NAME = 'advertisements'`,
  )
  for (const constraint of favoriteAdConstraints) {
    await pool.query(`ALTER TABLE favourites DROP FOREIGN KEY \`${constraint.CONSTRAINT_NAME}\``)
  }
  await pool.query('ALTER TABLE favourites MODIFY advertisement_id BIGINT UNSIGNED NULL')
  const [currentFavoriteAdConstraints] = await pool.query(
    `SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'favourites'
       AND COLUMN_NAME = 'advertisement_id' AND REFERENCED_TABLE_NAME = 'advertisements'`,
  )
  if (!currentFavoriteAdConstraints.length) {
    await pool.query(
      'ALTER TABLE favourites ADD CONSTRAINT fk_favourites_ad FOREIGN KEY (advertisement_id) REFERENCES advertisements (id) ON DELETE SET NULL',
    )
  }
  await pool.query(
    `UPDATE favourites f
     JOIN advertisements a ON a.id = f.advertisement_id
     JOIN users u ON u.id = a.user_id
     LEFT JOIN categories c ON c.id = a.category_id
     LEFT JOIN product_images pi ON pi.advertisement_id = a.id
     SET f.saved_title = COALESCE(f.saved_title, a.title),
         f.saved_price = COALESCE(f.saved_price, a.price),
         f.saved_condition_type = COALESCE(f.saved_condition_type, a.condition_type),
         f.saved_state = COALESCE(f.saved_state, a.state),
         f.saved_city = COALESCE(f.saved_city, a.city),
         f.saved_image = COALESCE(f.saved_image, pi.image_url),
         f.saved_seller_name = COALESCE(f.saved_seller_name, u.full_name),
         f.saved_category_id = COALESCE(f.saved_category_id, c.id)
     WHERE f.saved_title IS NULL OR f.saved_price IS NULL OR f.saved_seller_name IS NULL`,
  )

  const ensureColumn = async (table, name, definition) => {
    const [columns] = await pool.query(`SHOW COLUMNS FROM \`${table}\` LIKE ?`, [name])
    if (!columns.length) {
      await pool.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${name}\` ${definition}`)
    }
  }

  await ensureColumn('payment_transactions', 'provider_checkout_id', 'VARCHAR(100) NULL')
  await ensureColumn('payment_transactions', 'provider_payment_id', 'VARCHAR(100) NULL')
  await ensureColumn('payment_transactions', 'provider_session_expires_at', 'DATETIME NULL')
  const [paymentIndexes] = await pool.query('SHOW INDEX FROM payment_transactions')
  if (!paymentIndexes.some((index) => index.Key_name === 'uq_payment_provider_checkout')) {
    await pool.query(
      'ALTER TABLE payment_transactions ADD UNIQUE KEY uq_payment_provider_checkout (provider, provider_checkout_id)',
    )
  }

  const [userRole] = await pool.query("SHOW COLUMNS FROM users LIKE 'role'")
  if (userRole.length && !userRole[0].Type.includes("'super_admin'")) {
    await pool.query(
      "ALTER TABLE users MODIFY role ENUM('user', 'admin', 'super_admin') NOT NULL DEFAULT 'user'",
    )
  }

  const [verificationColumns] = await pool.query('SHOW COLUMNS FROM seller_verifications')
  const verificationColumnNames = new Set(verificationColumns.map((column) => column.Field))
  for (const [name, definition] of [
    ['business_owner', 'VARCHAR(120) NULL'],
    ['business_email', 'VARCHAR(254) NULL'],
    ['whatsapp', 'VARCHAR(32) NULL'],
    ['state', 'VARCHAR(100) NULL'],
    ['city', 'VARCHAR(120) NULL'],
    ['business_description', 'TEXT NULL'],
    ['website', 'VARCHAR(2048) NULL'],
    ['business_category_id', 'BIGINT UNSIGNED NULL'],
    ['cac_document_path', 'VARCHAR(255) NULL'],
    ['identity_document_path', 'VARCHAR(255) NULL'],
    ['additional_document_path', 'VARCHAR(255) NULL'],
    ['rejection_reason', 'VARCHAR(1000) NULL'],
  ]) {
    if (!verificationColumnNames.has(name)) {
      await pool.query(`ALTER TABLE seller_verifications ADD COLUMN \`${name}\` ${definition}`)
    }
  }
  const [verificationStatus] = await pool.query("SHOW COLUMNS FROM seller_verifications LIKE 'status'")
  if (verificationStatus.length && !verificationStatus[0].Type.includes("'information_requested'")) {
    await pool.query(
      `ALTER TABLE seller_verifications MODIFY status
       ENUM('pending', 'verified', 'rejected', 'information_requested', 'revoked')
       NOT NULL DEFAULT 'pending'`,
    )
  } else if (verificationStatus.length && !verificationStatus[0].Type.includes("'revoked'")) {
    await pool.query(
      `ALTER TABLE seller_verifications MODIFY status
       ENUM('pending', 'verified', 'rejected', 'information_requested', 'revoked')
       NOT NULL DEFAULT 'pending'`,
    )
  }
  const [verificationIndexes] = await pool.query('SHOW INDEX FROM seller_verifications')
  if (!verificationIndexes.some((index) => index.Key_name === 'idx_seller_verifications_category')) {
    await pool.query('ALTER TABLE seller_verifications ADD INDEX idx_seller_verifications_category (business_category_id)')
  }
  const [verificationConstraints] = await pool.query(
    `SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'seller_verifications'
       AND COLUMN_NAME = 'business_category_id' AND REFERENCED_TABLE_NAME = 'categories'`,
  )
  if (!verificationConstraints.length) {
    await pool.query(
      `ALTER TABLE seller_verifications ADD CONSTRAINT fk_seller_verifications_category
       FOREIGN KEY (business_category_id) REFERENCES categories (id) ON DELETE SET NULL`,
    )
  }

  const [advertisementStatus] = await pool.query("SHOW COLUMNS FROM advertisements LIKE 'status'")
  if (advertisementStatus.length && (
    !advertisementStatus[0].Type.includes("'paused'") ||
    !advertisementStatus[0].Type.includes("'suspended'") ||
    !advertisementStatus[0].Type.includes("'changes_requested'") ||
    !advertisementStatus[0].Type.includes("'sold'") ||
    !advertisementStatus[0].Type.includes("'expired'")
  )) {
    await pool.query(
      "ALTER TABLE advertisements MODIFY status ENUM('pending', 'approved', 'rejected', 'paused', 'suspended', 'changes_requested', 'sold', 'expired') NOT NULL DEFAULT 'pending'",
    )
  }
  await ensureColumn('advertisements', 'moderation_note', 'VARCHAR(1000) NULL')
  await ensureColumn('advertisements', 'approved_at', 'TIMESTAMP NULL')

  const [advertisementColumns] = await pool.query('SHOW COLUMNS FROM advertisements')
  const existingAdvertisementColumns = new Set(advertisementColumns.map((column) => column.Field))
  for (const [name, definition] of [
    ['brand', 'VARCHAR(120) NULL'],
    ['specifications', 'TEXT NULL'],
  ]) {
    if (!existingAdvertisementColumns.has(name)) {
      await pool.query(`ALTER TABLE advertisements ADD COLUMN ${name} ${definition}`)
    }
  }

  const [advertisementIndexes] = await pool.query('SHOW INDEX FROM advertisements')
  const fullTextColumns = advertisementIndexes
    .filter((index) => index.Key_name === 'ft_ads_search')
    .sort((a, b) => Number(a.Seq_in_index) - Number(b.Seq_in_index))
    .map((index) => index.Column_name)
  const expectedFullTextColumns = ['title', 'description', 'brand', 'specifications']
  if (fullTextColumns.join(',') !== expectedFullTextColumns.join(',')) {
    if (fullTextColumns.length) {
      await pool.query('ALTER TABLE advertisements DROP INDEX ft_ads_search')
    }
    await pool.query(
      'ALTER TABLE advertisements ADD FULLTEXT KEY ft_ads_search (title, description, brand, specifications)',
    )
  }

  const [indexRows] = await pool.query('SHOW INDEX FROM advertisements')
  const advertisementIndexMap = new Map()
  for (const index of indexRows) {
    if (!advertisementIndexMap.has(index.Key_name)) advertisementIndexMap.set(index.Key_name, [])
    advertisementIndexMap.get(index.Key_name)[Number(index.Seq_in_index) - 1] = index.Column_name
  }
  const ensureIndex = async (name, columns) => {
    const alreadyCovered = [...advertisementIndexMap.values()]
      .some((indexedColumns) => columns.every((column, i) => indexedColumns[i] === column))
    if (alreadyCovered) return
    await pool.query(`ALTER TABLE advertisements ADD INDEX ${name} (${columns.join(', ')})`)
  }
  await ensureIndex('idx_ads_condition_status', ['condition_type', 'status'])
  await ensureIndex('idx_ads_city_status', ['city', 'status'])

  await ensureColumn('categories', 'is_active', 'BOOLEAN NOT NULL DEFAULT TRUE')
  await ensureColumn('categories', 'display_order', 'INT NOT NULL DEFAULT 0')

  const [columns] = await pool.query('SHOW COLUMNS FROM users')
  const existingColumns = new Set(columns.map((column) => column.Field))
  const additions = [
    ['token_version', 'INT UNSIGNED NOT NULL DEFAULT 0'],
    ['password_reset_token', 'VARCHAR(255) NULL'],
    ['password_reset_expires_at', 'TIMESTAMP NULL'],
    ['pending_email', 'VARCHAR(254) NULL'],
    ['email_verification_token', 'VARCHAR(255) NULL'],
    ['email_verification_expires_at', 'TIMESTAMP NULL'],
    ['updated_at', 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'],
  ]

  for (const [name, definition] of additions) {
    if (!existingColumns.has(name)) {
      await pool.query(`ALTER TABLE users ADD COLUMN ${name} ${definition}`)
    }
  }

  const [notificationColumns] = await pool.query('SHOW COLUMNS FROM notifications')
  if (!notificationColumns.some((column) => column.Field === 'dedupe_key')) {
    await pool.query('ALTER TABLE notifications ADD COLUMN dedupe_key VARCHAR(191) NULL')
  }
  const [notificationIndexes] = await pool.query('SHOW INDEX FROM notifications')
  if (!notificationIndexes.some((index) => index.Key_name === 'uq_notifications_user_dedupe')) {
    await pool.query('ALTER TABLE notifications ADD UNIQUE KEY uq_notifications_user_dedupe (user_id, dedupe_key)')
  }

  const ensureMessageColumn = async (name, definition) => {
    const [columns] = await pool.query('SHOW COLUMNS FROM messages LIKE ?', [name])
    if (!columns.length) await pool.query(`ALTER TABLE messages ADD COLUMN \`${name}\` ${definition}`)
  }
  await ensureMessageColumn('conversation_id', 'BIGINT UNSIGNED NULL')
  await ensureMessageColumn("message_type", "ENUM('text', 'image') NOT NULL DEFAULT 'text'")
  await ensureMessageColumn('message_content', 'TEXT NULL')
  await ensureMessageColumn('attachment_url', 'VARCHAR(2048) NULL')
  await ensureMessageColumn('attachment_public_id', 'VARCHAR(255) NULL')
  await ensureMessageColumn('delivered_at', 'TIMESTAMP NULL')

  const [messageAdConstraints] = await pool.query(
    `SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'messages'
       AND COLUMN_NAME = 'advertisement_id' AND REFERENCED_TABLE_NAME = 'advertisements'`,
  )
  for (const constraint of messageAdConstraints) {
    await pool.query(`ALTER TABLE messages DROP FOREIGN KEY \`${constraint.CONSTRAINT_NAME}\``)
  }
  await pool.query('ALTER TABLE messages MODIFY advertisement_id BIGINT UNSIGNED NULL')
  const [currentMessageAdConstraints] = await pool.query(
    `SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'messages'
       AND COLUMN_NAME = 'advertisement_id' AND REFERENCED_TABLE_NAME = 'advertisements'`,
  )
  if (!currentMessageAdConstraints.length) {
    await pool.query(
      'ALTER TABLE messages ADD CONSTRAINT fk_messages_ad FOREIGN KEY (advertisement_id) REFERENCES advertisements (id) ON DELETE SET NULL',
    )
  }

  const [messageIndexes] = await pool.query('SHOW INDEX FROM messages')
  if (!messageIndexes.some((index) => index.Key_name === 'idx_messages_conversation_time')) {
    await pool.query('ALTER TABLE messages ADD INDEX idx_messages_conversation_time (conversation_id, created_at, id)')
  }

  const [messageConstraints] = await pool.query(
    `SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'messages'
       AND COLUMN_NAME = 'conversation_id' AND REFERENCED_TABLE_NAME = 'conversations'`,
  )
  if (!messageConstraints.length) {
    await pool.query(
      'ALTER TABLE messages ADD CONSTRAINT fk_messages_conversation FOREIGN KEY (conversation_id) REFERENCES conversations (id) ON DELETE CASCADE',
    )
  }

  await pool.query(
    `INSERT IGNORE INTO conversations (buyer_id, seller_id, advertisement_id)
     SELECT DISTINCT
       CASE WHEN m.sender_id = a.user_id THEN m.receiver_id ELSE m.sender_id END,
       a.user_id,
       m.advertisement_id
     FROM messages m
     JOIN advertisements a ON a.id = m.advertisement_id
     WHERE m.sender_id <> m.receiver_id
       AND a.user_id IN (m.sender_id, m.receiver_id)
       AND CASE WHEN m.sender_id = a.user_id THEN m.receiver_id ELSE m.sender_id END <> a.user_id`,
  )
  await pool.query(
    `INSERT IGNORE INTO conversation_participants (conversation_id, user_id)
     SELECT id, buyer_id FROM conversations`,
  )
  await pool.query(
    `INSERT IGNORE INTO conversation_participants (conversation_id, user_id)
     SELECT id, seller_id FROM conversations`,
  )
  await pool.query(
    `UPDATE messages m
     JOIN conversations c ON c.advertisement_id = m.advertisement_id
       AND c.seller_id = m.receiver_id
       AND c.buyer_id = m.sender_id
     SET m.conversation_id = c.id, m.message_content = COALESCE(m.message_content, m.message)
     WHERE m.conversation_id IS NULL`,
  )
  await pool.query(
    `UPDATE messages m
     JOIN conversations c ON c.advertisement_id = m.advertisement_id
       AND c.seller_id = m.sender_id
       AND c.buyer_id = m.receiver_id
     SET m.conversation_id = c.id, m.message_content = COALESCE(m.message_content, m.message)
     WHERE m.conversation_id IS NULL`,
  )

  const [reportColumns] = await pool.query('SHOW COLUMNS FROM reports')
  const existingReportColumns = new Set(reportColumns.map((column) => column.Field))
  for (const [name, definition] of [
    ['conversation_id', 'BIGINT UNSIGNED NULL'],
    ['message_id', 'BIGINT UNSIGNED NULL'],
  ]) {
    if (!existingReportColumns.has(name)) await pool.query(`ALTER TABLE reports ADD COLUMN ${name} ${definition}`)
  }
  const [reportCategory] = await pool.query("SHOW COLUMNS FROM reports LIKE 'category'")
  if (reportCategory.length && !reportCategory[0].Type.includes("'message_abuse'")) {
    await pool.query(
      `ALTER TABLE reports MODIFY category
       ENUM('fraud', 'fake_seller', 'misleading_description', 'incorrect_price',
            'duplicate', 'suspicious_activity', 'inappropriate_content', 'message_abuse', 'other') NOT NULL`,
    )
  }
  const ensureReportForeignKey = async (column, constraint, referencedTable) => {
    const [existing] = await pool.query(
      `SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'reports' AND COLUMN_NAME = ?
         AND REFERENCED_TABLE_NAME = ?`,
      [column, referencedTable],
    )
    if (!existing.length) {
      await pool.query(
        `ALTER TABLE reports ADD CONSTRAINT \`${constraint}\` FOREIGN KEY (\`${column}\`)
         REFERENCES \`${referencedTable}\` (id) ON DELETE SET NULL`,
      )
    }
  }
  await ensureReportForeignKey('conversation_id', 'fk_reports_conversation', 'conversations')
  await ensureReportForeignKey('message_id', 'fk_reports_message', 'messages')

  const [indexes] = await pool.query('SHOW INDEX FROM users')
  const hasUniquePhone = indexes.some(
    (index) => index.Column_name === 'phone' && Number(index.Non_unique) === 0,
  )
  if (!hasUniquePhone) {
    const [duplicates] = await pool.query(
      'SELECT phone FROM users WHERE phone IS NOT NULL GROUP BY phone HAVING COUNT(*) > 1 LIMIT 1',
    )
    if (duplicates.length) {
      console.warn('Skipped unique phone index: existing users contain duplicate phone numbers.')
    } else {
      await pool.query('ALTER TABLE users ADD UNIQUE KEY uq_users_phone (phone)')
    }
  }

  // ── Seller public slugs & username ──────────────────────────────────────────
  // 1. Add username column to users (the seller's chosen public handle)
  const [userCols] = await pool.query('SHOW COLUMNS FROM users')
  const userColNames = new Set(userCols.map((c) => c.Field))
  if (!userColNames.has('username')) {
    await pool.query('ALTER TABLE users ADD COLUMN username VARCHAR(50) NULL')
  }
  // Unique index on username (NULL values are excluded from uniqueness)
  const [userIndexes] = await pool.query('SHOW INDEX FROM users')
  if (!userIndexes.some((i) => i.Key_name === 'uq_users_username')) {
    await pool.query('ALTER TABLE users ADD UNIQUE KEY uq_users_username (username)')
  }

  // 2. public_slug column on seller_profiles (the canonical /@:slug handle)
  const [spCols] = await pool.query('SHOW COLUMNS FROM seller_profiles')
  const spColNames = new Set(spCols.map((c) => c.Field))
  if (!spColNames.has('public_slug')) {
    await pool.query("ALTER TABLE seller_profiles ADD COLUMN public_slug VARCHAR(50) NULL AFTER slug")
  }
  const [spIndexes] = await pool.query('SHOW INDEX FROM seller_profiles')
  if (!spIndexes.some((i) => i.Key_name === 'uq_seller_profiles_public_slug')) {
    await pool.query('ALTER TABLE seller_profiles ADD UNIQUE KEY uq_seller_profiles_public_slug (public_slug)')
  }

  // 3. Slug history table – preserves old slugs so shared links keep working
  await pool.query(`
    CREATE TABLE IF NOT EXISTS seller_slug_history (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      user_id BIGINT UNSIGNED NOT NULL,
      old_slug VARCHAR(50) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_slug_history_slug (old_slug),
      KEY idx_slug_history_user (user_id),
      CONSTRAINT fk_slug_history_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    ) ENGINE=InnoDB
  `)

  // 4. Backfill public_slug for existing seller_profiles that don't have one
  //    Priority: users.username → slugify(business_name) with uniqueness suffix
  const slugifyForProfile = (value) =>
    String(value || 'seller')
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 48) || 'seller'

  const [needSlug] = await pool.query(
    `SELECT sp.id, sp.user_id, sp.business_name, u.username
     FROM seller_profiles sp
     JOIN users u ON u.id = sp.user_id
     WHERE sp.public_slug IS NULL`,
  )
  for (const row of needSlug) {
    const userBase = row.username
      ? slugifyForProfile(row.username)
      : null
    const nameBase = slugifyForProfile(row.business_name)
    const candidates = userBase && userBase !== nameBase ? [userBase, nameBase] : [nameBase]
    let assigned = null
    outer: for (const candidate of candidates) {
      for (let suffix = 0; suffix <= 9999; suffix++) {
        const attempt = suffix === 0 ? candidate : `${candidate.slice(0, 45)}-${suffix}`
        const [[takenProfile]] = await pool.query(
          'SELECT 1 FROM seller_profiles WHERE public_slug = ? LIMIT 1',
          [attempt],
        )
        const [[takenHistory]] = await pool.query(
          'SELECT 1 FROM seller_slug_history WHERE old_slug = ? LIMIT 1',
          [attempt],
        )
        if (!takenProfile && !takenHistory) { assigned = attempt; break outer }
      }
    }
    if (assigned) {
      await pool.query(
        'UPDATE seller_profiles SET public_slug = ? WHERE id = ?',
        [assigned, row.id],
      )
      await pool.query(
        'UPDATE users SET username = ? WHERE id = ? AND username IS NULL',
        [assigned, row.user_id],
      )
    }
  }

  // 5. Sync users.username from public_slug for any still NULL
  await pool.query(
    `UPDATE users u
     JOIN seller_profiles sp ON sp.user_id = u.id
     SET u.username = sp.public_slug
     WHERE u.username IS NULL AND sp.public_slug IS NOT NULL`,
  )
}

module.exports = { pool, connectDB, ensureCoreSchema }
