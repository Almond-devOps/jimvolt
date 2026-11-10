const test = require('node:test')
const assert = require('node:assert/strict')
const { app, shutdownServer } = require('../server')
const { pool } = require('../config/database')

function findRoute(path) {
  return app._router.stack.find((layer) => layer.route?.path === path)?.route
}

test('health endpoint checks the database but returns only service status', async () => {
  const route = findRoute('/api/health')
  assert.ok(route)
  const handler = route.stack.at(-1).handle
  const originalQuery = pool.query
  let responseBody
  let nextError

  pool.query = async (sql) => {
    assert.equal(sql, 'SELECT 1')
    return [[{ 1: 1 }]]
  }

  try {
    await handler({}, {
      json(body) {
        responseBody = body
        return this
      },
    }, (error) => { nextError = error })
  } finally {
    pool.query = originalQuery
  }

  assert.ifError(nextError)
  assert.deepEqual(responseBody, { status: 'ok' })
})

test('database diagnostic endpoint is not registered', () => {
  assert.equal(findRoute('/api/test-db'), undefined)
})

test('graceful shutdown closes Socket.IO before the database pool', async () => {
  const events = []
  const server = {
    io: {
      close(callback) {
        events.push('socket')
        callback()
      },
    },
  }

  await shutdownServer(server, async () => events.push('database'))

  assert.deepEqual(events, ['socket', 'database'])
})
