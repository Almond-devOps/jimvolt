const assert = require('node:assert/strict')
const test = require('node:test')
const { withSchemaLock } = require('../utils/schemaLock')

// A fake pooled connection that records everything done to it, in order.
function fakeConnection({ lockError, rollbackError } = {}) {
  const events = []
  return {
    events,
    async beginTransaction() { events.push('begin') },
    async commit() { events.push('commit') },
    async rollback() {
      events.push('rollback')
      if (rollbackError) throw rollbackError
    },
    async query(sql, params) {
      if (/pg_advisory_xact_lock/.test(sql)) {
        events.push(`lock:${params[0]}`)
        if (lockError) throw lockError
      } else {
        events.push('set')
      }
      return [[]]
    },
    release() { events.push('release') },
    destroy() { events.push('destroy') },
  }
}

test('initialization runs inside a transaction holding a stable advisory lock', async () => {
  const keys = []
  for (const name of ['test-db', 'test-db']) {
    const connection = fakeConnection()
    await withSchemaLock({ getConnection: async () => connection }, name, async (given) => {
      assert.equal(given, connection)
      connection.events.push('initialize')
    })
    const lock = connection.events.find((event) => event.startsWith('lock:'))
    keys.push(lock)
    assert.deepEqual(connection.events.map((event) => event.split(':')[0]), ['begin', 'set', 'lock', 'initialize', 'commit', 'release'])
  }
  assert.equal(keys[0], keys[1], 'the same database must always use the same lock key')
  assert.match(keys[0], /^lock:-?\d+$/)
})

test('different databases use different lock keys', async () => {
  const lockFor = async (name) => {
    const connection = fakeConnection()
    await withSchemaLock({ getConnection: async () => connection }, name, async () => {})
    return connection.events.find((event) => event.startsWith('lock:'))
  }
  assert.notEqual(await lockFor('one'), await lockFor('two'))
})

test('failed schema initialization rolls back, releases the connection and propagates the original error', async () => {
  const failure = new Error('schema failed')
  const connection = fakeConnection()
  await assert.rejects(withSchemaLock({ getConnection: async () => connection }, 'test-db', async () => {
    throw failure
  }), (error) => error === failure)
  assert.deepEqual(connection.events.map((event) => event.split(':')[0]), ['begin', 'set', 'lock', 'rollback', 'release'])
})

test('lock timeout is reported as busy before any schema change and returns the connection', async () => {
  const connection = fakeConnection({ lockError: Object.assign(new Error('canceling statement due to lock timeout'), { code: '55P03' }) })
  await assert.rejects(withSchemaLock({ getConnection: async () => connection }, 'test-db', async () => {
    assert.fail('must not run without the lock')
  }), (error) => error.code === 'SCHEMA_BUSY' && /initialization is busy/.test(error.message))
  assert.ok(connection.events.includes('rollback'))
  assert.ok(connection.events.includes('release'))
})

test('a failed rollback destroys the connection instead of pooling it', async () => {
  const connection = fakeConnection({ rollbackError: new Error('connection lost') })
  await assert.rejects(withSchemaLock({ getConnection: async () => connection }, 'test-db', async () => {
    throw new Error('schema failed')
  }), /schema failed/)
  assert.ok(connection.events.includes('destroy'))
  assert.ok(!connection.events.includes('release'))
})
