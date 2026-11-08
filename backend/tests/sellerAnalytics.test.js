const assert = require('node:assert/strict')
const test = require('node:test')
const { pool } = require('../config/database')
const sellerModel = require('../models/sellerModel')
const adModel = require('../models/adModel')
const { dateRange } = require('../controllers/sellerController')

test('seller analytics date ranges support defaults, year-to-date, and bounded custom dates', () => {
  const defaults = dateRange({})
  assert.equal((Date.parse(`${defaults.to}T00:00:00Z`) - Date.parse(`${defaults.from}T00:00:00Z`)) / 86400000, 29)

  const custom = dateRange({ from: '2026-01-01', to: '2026-02-01', days: '365' })
  assert.deepEqual(custom, { from: '2026-01-01', to: '2026-02-01' })
  assert.throws(() => dateRange({ from: '2026-01-01' }), {
    statusCode: 400,
    message: 'Choose both a start date and an end date.',
  })
  assert.throws(() => dateRange({ from: '2025-01-01', to: '2026-02-01', days: '365' }), {
    statusCode: 400,
    message: 'Analytics date ranges cannot exceed one year.',
  })
})

test('seller advertisement search includes keywords, category and location without changing owner scope', async () => {
  const originalExecute = pool.execute
  const statements = []
  pool.execute = async (sql, params = []) => {
    statements.push({ sql, params })
    if (sql.includes('ORDER BY a.created_at')) return [[]]
    if (sql.includes('SELECT COUNT(*) AS total FROM advertisements')) return [[{ total: 0 }]]
    throw new Error(`Unexpected SQL in seller advertisement search test: ${sql}`)
  }

  try {
    await adModel.findOwnedAds({
      userId: 42, status: null, search: 'solar', sortBy: 'newest', limit: 20, offset: 0,
    })
    await adModel.countOwnedAds({ userId: 42, status: null, search: 'solar' })
    assert.match(statements[0].sql, /c\.name LIKE \? OR a\.state LIKE \? OR a\.city LIKE \?/)
    assert.match(statements[0].sql, /a\.user_id = \?/)
    assert.deepEqual(statements[0].params, [42, ...Array(6).fill('%solar%'), 20, 0])
    assert.match(statements[1].sql, /category_id IN \(SELECT id FROM categories WHERE name LIKE \?\)/)
    assert.deepEqual(statements[1].params, [42, ...Array(6).fill('%solar%')])
  } finally {
    pool.execute = originalExecute
  }
})

test('seller analytics aggregate only owned listings and map real activity counts', async () => {
  const originalExecute = pool.execute
  const queries = []
  pool.execute = async (sql, params = []) => {
    queries.push({ sql, params })
    if (sql.includes('DATE_FORMAT(aa.occurred_at')) return [[{ day: '2026-01-02', total: '4' }]]
    if (sql.includes('DATE_FORMAT(m.created_at')) return [[{ day: '2026-01-03', total: '2' }]]
    if (sql.includes('COUNT(*) AS total_ads')) {
      return [[{ total_ads: '3', active_ads: '1', pending_ads: '1', rejected_ads: '1', total_views: '24' }]]
    }
    if (sql.includes('FROM messages m') && sql.includes('COUNT(*) AS total')) return [[{ total: '5' }]]
    if (sql.includes('AS favourites')) {
      return [[{
        id: 8,
        title: 'Solar unit',
        status: 'approved',
        views: '24',
        enquiries: '5',
        favourites: '2',
        price: '1200.00',
        created_at: new Date('2026-01-01T00:00:00.000Z'),
        category_name: 'Solar',
        state: 'Lagos',
        city: 'Ikeja',
      }]]
    }
    if (sql.includes('FROM favourites f')) return [[{ total: '2' }]]
    if (sql.includes('GROUP BY a.status')) return [[{ status: 'approved', total: '1' }, { status: 'pending', total: '1' }, { status: 'rejected', total: '1' }]]
    throw new Error(`Unexpected SQL in seller analytics test: ${sql}`)
  }

  try {
    const data = await sellerModel.getAnalytics(42, '2026-01-01', '2026-01-31', null)
    assert.equal(data.totalAdvertisements, 3)
    assert.equal(data.activeAdvertisements, 1)
    assert.equal(data.pendingAdvertisements, 1)
    assert.equal(data.rejectedAdvertisements, 1)
    assert.equal(data.totalViews, 24)
    assert.equal(data.totalEnquiries, 5)
    assert.equal(data.totalFavourites, 2)
    assert.deepEqual(data.trackedViews, [{ date: '2026-01-02', views: 4 }])
    assert.deepEqual(data.enquiries, [{ date: '2026-01-03', enquiries: 2 }])
    assert.deepEqual(data.statusDistribution, [
      { status: 'approved', count: 1 },
      { status: 'pending', count: 1 },
      { status: 'rejected', count: 1 },
    ])
    assert.equal(data.topAdvertisements[0].views, 24)
    assert.equal(data.topAdvertisements[0].favourites, 2)
    for (const { sql, params } of queries) {
      assert.match(sql, /user_id = \?/)
      assert.ok(params.includes(42))
    }
  } finally {
    pool.execute = originalExecute
  }
})
