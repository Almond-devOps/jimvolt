const { createHash } = require('node:crypto')

// MySQL named locks belong to a session, so every schema query must use this
// connection until the lock is released. A process-local promise cannot guard
// against other Vercel instances starting at the same time.
async function withSchemaLock(pool, databaseName, initialize) {
  const connection = await pool.getConnection()
  const lockName = `jimvolt:schema:${createHash('sha256').update(databaseName).digest('hex').slice(0, 40)}`
  let locked = false
  let failed = false
  let reusable = false
  try {
    const [rows] = await connection.query('SELECT GET_LOCK(?, 30) AS acquired', [lockName])
    reusable = true
    locked = Number(rows[0]?.acquired) === 1
    if (!locked) throw new Error('Database schema initialization is busy. Please retry shortly.')
    return await initialize(connection)
  } catch (error) {
    failed = true
    throw error
  } finally {
    try {
      if (locked) {
        const [rows] = await connection.query('SELECT RELEASE_LOCK(?) AS released', [lockName])
        if (Number(rows[0]?.released) !== 1) throw new Error('Could not release the database schema lock.')
      }
    } catch (error) {
      reusable = false
      if (!failed) throw error
      console.error('Could not release the database schema lock:', error.message)
    } finally {
      if (reusable) connection.release()
      else connection.destroy()
    }
  }
}

module.exports = { withSchemaLock }
