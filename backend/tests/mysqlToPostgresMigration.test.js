// Runs the MySQL -> PostgreSQL copy against a throwaway database, using fake MySQL rows. Skipped
// unless JIMVOLT_TEST_POSTGRES=1 (needs DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME and a
// user allowed to CREATE DATABASE).
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const { convertValue, migrate, USE_DEFAULT } = require('../scripts/migrateMysqlToPostgres')

test('convertValue turns MySQL values into PostgreSQL-ready values', () => {
  assert.equal(convertValue('users', 'is_verified', 1), true)
  assert.equal(convertValue('users', 'is_verified', 0), false)
  assert.equal(convertValue('messages', 'is_read', '1'), true)
  assert.equal(convertValue('admin_audit_logs', 'new_value', { status: 'ok' }), '{"status":"ok"}')
  assert.equal(convertValue('admin_audit_logs', 'new_value', '{"a":1}'), '{"a":1}')
  assert.equal(convertValue('users', 'created_at', new Date('invalid')), USE_DEFAULT)
  assert.equal(convertValue('users', 'phone', undefined), null)
  assert.equal(convertValue('advertisements', 'price', '150000.50'), '150000.50')
})

const enabled = process.env.JIMVOLT_TEST_POSTGRES === '1'

test('copies every table, converts types, keeps ids and moves the sequences', { skip: !enabled && 'set JIMVOLT_TEST_POSTGRES=1 and DB_* to run' }, async (t) => {
  const { Client } = require('pg')
  const connection = (database) => ({
    host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 5432), user: process.env.DB_USER,
    password: process.env.DB_PASSWORD, database,
  })
  const databaseName = `${process.env.DB_NAME}_migration_${Date.now()}`
  const admin = new Client(connection(process.env.DB_NAME))
  await admin.connect()
  await admin.query(`CREATE DATABASE "${databaseName}"`)
  const target = new Client(connection(databaseName))
  await target.connect()
  t.after(async () => {
    await target.end()
    await admin.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`)
    await admin.end()
  })

  await target.query(fs.readFileSync(path.join(__dirname, '..', 'config', 'schema.sql'), 'utf8'))
  // Seeded defaults, like the ones startup creates; the copy must replace them.
  await target.query("INSERT INTO categories (name, slug) VALUES ('Seeded', 'seeded')")
  await target.query("INSERT INTO promotion_packages (name, price, duration_days) VALUES ('Seeded', 100, 1)")

  const created = new Date('2026-05-01T10:00:00Z')
  const rows = {
    users: [
      { id: 7, full_name: 'Ada', email: 'Ada@Example.com', phone: '0801', password: 'h', token_version: 0, role: 'user', profile_image: null, account_status: 'active', is_verified: 1, created_at: created, updated_at: created, legacy_column: 'ignored' },
      { id: 9, full_name: 'Bayo', email: 'bayo@example.com', phone: null, password: 'h', token_version: 2, role: 'admin', profile_image: null, account_status: 'active', is_verified: 0, created_at: created, updated_at: new Date('invalid') },
    ],
    categories: [{ id: 3, name: 'Solar', slug: 'solar', is_active: 1, display_order: 0, created_at: created }],
    advertisements: [{ id: 11, user_id: 7, category_id: 3, title: 'Panel', slug: 'panel-11', description: 'A panel', price: '150000.50', condition_type: 'new', state: 'Lagos', city: 'Ikeja', phone: '0801', status: 'approved', views: 4, is_featured: 0, created_at: created, updated_at: created }],
    messages: [{ id: 5, sender_id: 7, receiver_id: 9, message: 'hello', message_type: 'text', is_read: 1, created_at: created }],
    admin_audit_logs: [{ id: 2, administrator_id: 9, action: 'x', entity_type: 'ad', entity_id: 11, previous_value: { status: 'pending' }, new_value: { status: 'approved' }, created_at: created }],
    promotion_packages: [{ id: 4, name: 'Boost', description: '', price: '2000.00', duration_days: 3, is_active: 1, created_at: created, updated_at: created }],
    seller_ratings: [{ seller_id: 7, reviewer_id: 9, score: 5, created_at: created, updated_at: created }],
  }
  const source = { query: async (sql) => rows[/`(\w+)`/.exec(sql)[1]] ?? [] }

  const logs = []
  const summary = await migrate({ source, target, log: (line) => logs.push(line) })
  assert.equal(summary.find((entry) => entry.table === 'users').copied, 2)

  const one = async (sql, params) => (await target.query(sql, params)).rows[0]
  const user = await one('SELECT * FROM users WHERE id = 7')
  assert.equal(user.is_verified, true)
  assert.equal(user.email, 'Ada@Example.com')
  assert.equal(user.created_at.toISOString(), created.toISOString())
  assert.equal((await one('SELECT is_verified FROM users WHERE id = 9')).is_verified, false)
  assert.equal((await one('SELECT updated_at FROM users WHERE id = 9')).updated_at !== null, true, 'an invalid date falls back to the column default')
  assert.equal((await one('SELECT price FROM advertisements WHERE id = 11')).price, '150000.50')
  assert.deepEqual((await one('SELECT new_value FROM admin_audit_logs WHERE id = 2')).new_value, { status: 'approved' })
  assert.equal((await one("SELECT count(*)::int AS n FROM categories WHERE slug = 'seeded'")).n, 0, 'seeded rows are replaced')
  assert.equal((await one('SELECT count(*)::int AS n FROM promotion_packages')).n, 1)
  assert.equal((await one('SELECT is_read FROM messages WHERE id = 5')).is_read, true)

  // Sequences moved past the copied ids, so new rows do not collide.
  const next = await one("INSERT INTO users (full_name, email, password) VALUES ('New', 'new@example.com', 'h') RETURNING id")
  assert.equal(Number(next.id), 10) // a raw pg client returns BIGINT as text
  const emptyTable = await one("INSERT INTO notifications (user_id, type, title, body) VALUES (7, 't', 'T', 'B') RETURNING id")
  assert.equal(Number(emptyTable.id), 1, 'an empty source table starts its sequence at 1')

  await assert.rejects(migrate({ source, target, log: () => {} }), /already contains data/)
  assert.equal((await one('SELECT count(*)::int AS n FROM users')).n, 3, 'a refused run leaves the data untouched')
})
