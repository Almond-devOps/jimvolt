const { createHash } = require('node:crypto')

// Serialises schema initialisation across serverless instances with a PostgreSQL advisory lock.
// The lock is transaction-scoped (pg_advisory_xact_lock), so it is released automatically on
// COMMIT/ROLLBACK and also works behind PgBouncer in transaction-pooling mode.
const LOCK_WAIT = '15s'

function lockKey(databaseName) {
  // A stable signed 64-bit key derived from the database name.
  const digest = createHash('sha256').update(`jimvolt:schema:${databaseName}`).digest()
  return digest.readBigInt64BE(0).toString()
}

async function withSchemaLock(pool, databaseName, initialize) {
  const connection = await pool.getConnection()
  let reusable = true
  try {
    await connection.beginTransaction()
    try {
      await connection.query(`SET LOCAL lock_timeout = '${LOCK_WAIT}'`)
      await connection.query('SELECT pg_advisory_xact_lock(?::bigint)', [lockKey(databaseName)])
    } catch (error) {
      await connection.rollback().catch(() => { reusable = false })
      if (error.code === '55P03' || /lock timeout/i.test(error.message || '')) {
        throw Object.assign(new Error('Database schema initialization is busy. Please retry shortly.'), { code: 'SCHEMA_BUSY' })
      }
      throw error
    }
    try {
      const result = await initialize(connection)
      await connection.commit()
      return result
    } catch (error) {
      await connection.rollback().catch(() => { reusable = false })
      throw error
    }
  } finally {
    if (reusable) connection.release()
    else connection.destroy()
  }
}

module.exports = { withSchemaLock }
