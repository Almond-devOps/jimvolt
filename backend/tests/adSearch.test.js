const test = require('node:test')
const assert = require('node:assert/strict')
const { buildFilters, normalizeState, sortOrders } = require('../utils/adSearch')

test('builds parameterized multi-field search and filters approved listings only', () => {
  const filters = buildFilters({
    q: 'hybrid inverter',
    category: 'solar-inverters',
    state: 'Abuja',
    city: 'Wuse',
    minPrice: '100000',
    maxPrice: '1000000',
    condition: 'new',
    verified: 'true',
    featured: 'false',
    recently: 'true',
  })

  assert.match(filters.where, /a\.status = 'approved'/)
  assert.match(filters.where, /to_tsvector\('simple', coalesce\(a\.title, ''\).*@@ to_tsquery\('simple', \?\)/)
  assert.match(filters.where, /a\.condition_type = \?/)
  assert.match(filters.where, /u\.is_verified = \?/)
  assert.match(filters.where, /a\.is_featured = \?/)
  assert.ok(filters.values.includes('FCT Abuja'))
  assert.ok(filters.values.includes('Wuse'))
  assert.ok(filters.values.includes(100000))
  assert.ok(filters.values.includes(1000000))
  assert.ok(!filters.where.includes('hybrid inverter'))
})

test('normalizes Abuja aliases and exposes only fixed sort SQL', () => {
  assert.equal(normalizeState('Abuja'), 'FCT Abuja')
  assert.equal(normalizeState('FCT'), 'FCT Abuja')
  assert.equal(normalizeState('Lagos'), 'Lagos')
  assert.equal(sortOrders.newest, 'a.created_at DESC, a.id DESC')
  assert.equal(sortOrders.oldest, 'a.created_at ASC, a.id ASC')
  assert.equal(sortOrders.price_asc, 'a.price ASC, a.created_at DESC')
  assert.equal(sortOrders.price_desc, 'a.price DESC, a.created_at DESC')
})

test('random ordering is stable for a browsing seed and rejects SQL in seeds', () => {
  const { randomOrder } = require('../utils/adSearch')
  assert.equal(randomOrder(123), randomOrder('123'))
  assert.notEqual(randomOrder(123), randomOrder(124))
  assert.match(randomOrder(123), /a.id ASC$/)
  assert.equal(randomOrder('1); DROP TABLE users'), randomOrder(0))
})
