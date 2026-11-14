#!/usr/bin/env node
/*
 * One-time copy of the Jimvolt data from MySQL to PostgreSQL.
 *
 *   1. Start the backend once against the new PostgreSQL database (or run any script that
 *      connects) so config/schema.sql has created the tables.
 *   2. Put the PostgreSQL connection in backend/.env (DB_HOST, DB_PORT, DB_USER, DB_PASSWORD,
 *      DB_NAME, DB_SSL_CA) and the old MySQL connection in the SOURCE_DB_* variables below.
 *   3. Stop writes to the old site, then run:
 *        node scripts/migrateMysqlToPostgres.js --dry-run   # counts rows only
 *        node scripts/migrateMysqlToPostgres.js             # copies everything
 *
 * Source variables: SOURCE_DB_HOST, SOURCE_DB_PORT, SOURCE_DB_USER, SOURCE_DB_PASSWORD,
 * SOURCE_DB_NAME, SOURCE_DB_SSL_CA (path), SOURCE_DB_TIMEZONE (default "Z", meaning UTC).
 *
 * The copy runs in one transaction, so a failure leaves PostgreSQL untouched. It refuses to run
 * when the target already contains data (the seeded categories and promotion packages are
 * replaced by the real ones). The source database is only read.
 */
const { TABLES_WITH_ID } = require('../utils/sqlAdapter')

// Parents before children, so foreign keys are satisfied as rows are inserted.
const TABLES = [
  'users', 'categories', 'category_subcategories', 'advertisements', 'product_images', 'favourites',
  'recently_viewed', 'price_history', 'wishlist_preferences', 'conversations', 'conversation_participants',
  'messages', 'seller_profiles', 'seller_slug_history', 'seller_verifications', 'advertisement_analytics',
  'notifications', 'admin_audit_logs', 'reports', 'payment_transactions', 'bachs_webhook_events',
  'promotion_packages', 'promotions', 'seller_ratings',
]

// MySQL stores these as TINYINT(1); PostgreSQL needs real booleans.
const BOOLEAN_COLUMNS = {
  users: ['is_verified'],
  categories: ['is_active'],
  advertisements: ['is_featured'],
  wishlist_preferences: ['notify_price_drops'],
  conversation_participants: ['is_archived'],
  messages: ['is_read'],
  notifications: ['is_read'],
  promotion_packages: ['is_active'],
}
const JSON_COLUMNS = { admin_audit_logs: ['previous_value', 'new_value'] }

// Tables that startup seeds with default rows, replaced by the real ones during the copy.
const SEEDED_TABLES = ['categories', 'promotion_packages']

// Marker for "let the column's default apply".
const USE_DEFAULT = Symbol('use-default')

function convertValue(table, column, value) {
  if (value === undefined || value === null) return null
  if (BOOLEAN_COLUMNS[table]?.includes(column)) return Boolean(Number(value))
  if (JSON_COLUMNS[table]?.includes(column)) return typeof value === 'string' ? value : JSON.stringify(value)
  // mysql2 returns Invalid Date for MySQL zero dates ('0000-00-00'); PostgreSQL has no equivalent,
  // so the column default applies (NULL for nullable columns, CURRENT_TIMESTAMP for the rest).
  if (value instanceof Date && Number.isNaN(value.getTime())) return USE_DEFAULT
  return value
}

const quote = (name) => `"${String(name).replace(/"/g, '""')}"`

async function targetColumns(target, table) {
  const { rows } = await target.query(
    'SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1',
    [table],
  )
  return rows.map((row) => row.column_name)
}

async function insertRows(target, table, columns, rows) {
  if (!rows.length) return
  const batchSize = Math.max(1, Math.floor(60000 / columns.length))
  for (let start = 0; start < rows.length; start += batchSize) {
    const batch = rows.slice(start, start + batchSize)
    const values = []
    const tuples = batch.map((row) => {
      const placeholders = columns.map((column) => {
        const value = convertValue(table, column, row[column])
        if (value === USE_DEFAULT) return 'DEFAULT'
        values.push(value)
        return `$${values.length}`
      })
      return `(${placeholders.join(', ')})`
    })
    await target.query(`INSERT INTO ${quote(table)} (${columns.map(quote).join(', ')}) VALUES ${tuples.join(', ')}`, values)
  }
}

/**
 * @param source  { query(sql): Promise<row[]> }  read access to MySQL
 * @param target  a node-postgres Client or Pool (the PostgreSQL database)
 */
async function migrate({ source, target, dryRun = false, log = console.log }) {
  const summary = []

  if (dryRun) {
    for (const table of TABLES) {
      const [{ total }] = await source.query(`SELECT COUNT(*) AS total FROM \`${table}\``)
      summary.push({ table, source: Number(total), copied: 0 })
      log(`${table}: ${total} rows in MySQL`)
    }
    return summary
  }

  // A Pool hands out a client (and needs it released); a Client is used as it is.
  const isPool = typeof target.totalCount === 'number'
  const client = isPool ? await target.connect() : target
  try {
    await client.query('BEGIN')

    for (const table of TABLES) {
      if (SEEDED_TABLES.includes(table)) continue
      const { rows } = await client.query(`SELECT 1 FROM ${quote(table)} LIMIT 1`)
      if (rows.length) {
        throw new Error(`The PostgreSQL table "${table}" already contains data. Run this on a fresh database.`)
      }
    }
    // The seeded defaults would collide with the real rows on the unique name/slug columns.
    await client.query('DELETE FROM promotion_packages')
    await client.query('DELETE FROM categories')

    for (const table of TABLES) {
      const sourceRows = await source.query(`SELECT * FROM \`${table}\``)
      const targetNames = new Set(await targetColumns(client, table))
      const columns = sourceRows.length ? Object.keys(sourceRows[0]).filter((name) => targetNames.has(name)) : []
      await insertRows(client, table, columns, sourceRows)
      summary.push({ table, source: sourceRows.length, copied: sourceRows.length })
      log(`${table}: copied ${sourceRows.length} rows`)
    }

    // Explicit ids were inserted, so move each identity sequence past the highest copied id.
    for (const table of TABLES.filter((name) => TABLES_WITH_ID.has(name))) {
      await client.query(
        `SELECT setval(pg_get_serial_sequence($1, 'id'), COALESCE((SELECT MAX(id) FROM ${quote(table)}), 1), (SELECT COUNT(*) > 0 FROM ${quote(table)}))`,
        [quote(table)],
      )
    }

    for (const entry of summary) {
      const { rows } = await client.query(`SELECT COUNT(*) AS total FROM ${quote(entry.table)}`)
      if (Number(rows[0].total) !== entry.source) {
        throw new Error(`Row count mismatch in "${entry.table}": MySQL ${entry.source}, PostgreSQL ${rows[0].total}.`)
      }
    }
    await client.query('COMMIT')
    log('Done. Row counts match for every table.')
    return summary
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    if (isPool) client.release()
  }
}

async function main() {
  const fs = require('node:fs')
  const path = require('node:path')
  let mysql
  try {
    mysql = require('mysql2/promise')
  } catch {
    throw new Error('Install the MySQL driver for this one-off script first: npm install --no-save mysql2')
  }
  require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') })
  const required = ['SOURCE_DB_HOST', 'SOURCE_DB_USER', 'SOURCE_DB_PASSWORD', 'SOURCE_DB_NAME']
  const missing = required.filter((name) => !process.env[name])
  if (missing.length) throw new Error(`Missing source MySQL settings: ${missing.join(', ')}`)

  const caPath = process.env.SOURCE_DB_SSL_CA?.trim()
  const connection = await mysql.createConnection({
    host: process.env.SOURCE_DB_HOST,
    port: Number(process.env.SOURCE_DB_PORT || 3306),
    user: process.env.SOURCE_DB_USER,
    password: process.env.SOURCE_DB_PASSWORD,
    database: process.env.SOURCE_DB_NAME,
    timezone: process.env.SOURCE_DB_TIMEZONE || 'Z',
    ...(caPath ? { ssl: { ca: fs.readFileSync(path.resolve(__dirname, '..', caPath), 'utf8'), rejectUnauthorized: true } } : {}),
  })
  const source = { query: async (sql) => (await connection.query(sql))[0] }

  const { pool } = require('../config/database')
  try {
    await migrate({ source, target: pool.raw, dryRun: process.argv.includes('--dry-run') })
  } finally {
    await connection.end()
    await pool.end()
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message)
    process.exit(1)
  })
}

module.exports = { migrate, convertValue, USE_DEFAULT, TABLES }
