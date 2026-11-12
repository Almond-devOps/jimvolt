const assert = require('node:assert/strict')
const test = require('node:test')
const { withSchemaLock } = require('../utils/schemaLock')

test('concurrent initializers wait for the database lock and use the owning session', async () => {
  let tail = Promise.resolve()
  let active = 0
  const names = []
  const connections = []
  const pool = {
    async getConnection() {
      let unlock
      const connection = {
        async query(sql, params) {
          if (sql.includes('GET_LOCK')) {
            names.push(params[0])
            const previous = tail
            tail = new Promise((resolve) => { unlock = resolve })
            await previous
            connection.locked = true
            return [[{ acquired: 1 }]]
          }
          assert.ok(connection.locked)
          connection.locked = false
          unlock()
          return [[{ released: 1 }]]
        },
        release() { assert.equal(connection.locked, false); connection.returned = true },
      }
      connections.push(connection)
      return connection
    },
  }
  const initialize = async (connection) => {
    assert.ok(connection.locked)
    assert.equal(active++, 0, 'only one initializer may alter the schema')
    await new Promise((resolve) => setImmediate(resolve))
    active--
  }
  await Promise.all([withSchemaLock(pool, 'test-db', initialize), withSchemaLock(pool, 'test-db', initialize)])
  assert.equal(names[0], names[1])
  assert.ok(names[0].length <= 64)
  assert.ok(connections.every((connection) => connection.returned))
})

test('failed schema initialization releases its lock and propagates the original error', async () => {
  const failure = new Error('schema failed')
  const events = []
  const connection = {
    async query(sql) {
      events.push(sql.includes('GET_LOCK') ? 'acquire' : 'unlock')
      return [[sql.includes('GET_LOCK') ? { acquired: 1 } : { released: 1 }]]
    },
    release() { events.push('return') },
  }
  await assert.rejects(withSchemaLock({ getConnection: async () => connection }, 'test-db', async () => {
    throw failure
  }), (error) => error === failure)
  assert.deepEqual(events, ['acquire', 'unlock', 'return'])
})

test('lock timeout fails before schema changes and returns the connection', async () => {
  let returned = false
  const connection = {
    query: async () => [[{ acquired: 0 }]],
    release() { returned = true },
  }
  await assert.rejects(withSchemaLock({ getConnection: async () => connection }, 'test-db', async () => {
    assert.fail('must not run unlocked')
  }), /initialization is busy/)
  assert.ok(returned)
})

test('an uncertain lock release destroys the connection rather than pooling it', async () => {
  let destroyed = false
  const connection = {
    query: async (sql) => [[sql.includes('GET_LOCK') ? { acquired: 1 } : { released: 0 }]],
    destroy() { destroyed = true },
    release() { assert.fail('must not reuse a session that may hold a lock') },
  }
  await assert.rejects(withSchemaLock({ getConnection: async () => connection }, 'test-db', async () => {}), /release the database schema lock/)
  assert.ok(destroyed)
})

test('the complete schema initializer runs every query on the lock-owning connection', async () => {
  const { pool, ensureCoreSchema } = require('../config/database')
  const original = { getConnection: pool.getConnection, query: pool.query, execute: pool.execute }
  let locked = false
  let returned = false
  const statements = []
  const connection = {
    async query(sql) {
      if (sql.includes('GET_LOCK')) { locked = true; return [[{ acquired: 1 }]] }
      assert.ok(locked, 'schema queries must be covered by the lock')
      if (sql.includes('RELEASE_LOCK')) { locked = false; return [[{ released: 1 }]] }
      statements.push(sql)
      return [[]]
    },
    async execute(sql) {
      assert.ok(locked)
      statements.push(sql)
      return [[{ id: 1 }]]
    },
    release() { assert.equal(locked, false); returned = true },
  }
  pool.getConnection = async () => connection
  pool.query = pool.execute = async () => assert.fail('must not use another pooled connection for schema changes')
  try {
    await ensureCoreSchema()
    assert.ok(statements.some((sql) => sql.includes('ADD CONSTRAINT fk_favourites_ad')))
    assert.ok(statements.some((sql) => sql.includes('ADD CONSTRAINT fk_messages_ad')))
    assert.ok(returned)
  } finally {
    Object.assign(pool, original)
  }
})
