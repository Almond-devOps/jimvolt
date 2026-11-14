const assert = require('node:assert/strict')
const test = require('node:test')
const express = require('express')
const http = require('node:http')
const jwt = require('jsonwebtoken')
const userModel = require('../models/userModel')
const ratings = require('../models/sellerRatingModel')
const routes = require('../routes/adRoutes')
const { errorHandler } = require('../middleware/errorMiddleware')
const { pool } = require('../config/database')

test('seller ratings are public to read but require valid authenticated non-self submissions', async (t) => {
  const originals = { findById: userModel.findById, findPublicSeller: userModel.findPublicSeller, summary: ratings.summary, save: ratings.save }
  const oldSecret = process.env.JWT_SECRET
  process.env.JWT_SECRET = 'seller-ratings-local-test-secret-at-least-32'
  const summary = { average: 4, count: 1, mine: 4 }
  let writes = 0
  userModel.findById = async (id) => ({ id, account_status: 'active', token_version: 0 })
  userModel.findPublicSeller = async (id) => String(id) === '7' ? { id: 7 } : null
  ratings.summary = async () => summary
  ratings.save = async (seller, reviewer, score) => {
    assert.equal(String(seller), '7'); assert.equal(String(reviewer), '42'); assert.equal(score, 4)
    writes++
    return summary
  }
  const app = express()
  app.use(express.json())
  app.use('/ads', routes)
  app.use(errorHandler)
  const server = http.createServer(app)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  t.after(async () => {
    server.closeAllConnections(); await new Promise((resolve) => server.close(resolve))
    userModel.findById = originals.findById; userModel.findPublicSeller = originals.findPublicSeller
    ratings.summary = originals.summary; ratings.save = originals.save
    if (oldSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = oldSecret
  })
  const url = `http://127.0.0.1:${server.address().port}/ads/sellers/7/ratings`
  const put = (score, userId) => fetch(url, { method: 'PUT', headers: {
    'content-type': 'application/json', ...(userId ? { authorization: `Bearer ${jwt.sign({ sub: String(userId), tokenVersion: 0 }, process.env.JWT_SECRET)}` } : {}),
  }, body: JSON.stringify({ score }) })
  assert.equal((await fetch(url)).status, 200)
  assert.equal((await put(4)).status, 401)
  assert.equal((await put(4, 7)).status, 400)
  for (const score of [0, 6, 1.5, 'bad']) assert.equal((await put(score, 42)).status, 400)
  assert.equal(writes, 0)
  assert.deepEqual(await (await put(4, 42)).json(), summary)
  assert.equal(writes, 1)
})

test('re-rating updates the existing seller/reviewer pair and reads numeric aggregates', async () => {
  const original = pool.execute
  const calls = []
  pool.execute = async (sql, params) => {
    calls.push({ sql, params })
    if (sql.includes('AVG')) return [[{ average: '4.5000', count: 2 }]]
    if (sql.startsWith('SELECT score')) return [[{ score: 5 }]]
    return [{ affectedRows: 1 }]
  }
  try {
    assert.deepEqual(await ratings.save(7, 42, 5), { average: 4.5, count: 2, mine: 5 })
    assert.match(calls[0].sql, /ON CONFLICT \(seller_id, reviewer_id\) DO UPDATE/)
    assert.deepEqual(calls[0].params, [7, 42, 5])
  } finally { pool.execute = original }
})
