const assert = require('node:assert/strict')
const http = require('node:http')
const test = require('node:test')
const express = require('express')
const jwt = require('jsonwebtoken')
const adModel = require('../models/adModel')
const userModel = require('../models/userModel')
const sellerRoutes = require('../routes/sellerRoutes')
const { errorHandler } = require('../middleware/errorMiddleware')

test('seller ads accepts All statuses and supported database statuses, scoped to authenticated user', async (t) => {
  const previousSecret = process.env.JWT_SECRET
  const originalFindById = userModel.findById
  const originalFindOwnedAds = adModel.findOwnedAds
  const originalCountOwnedAds = adModel.countOwnedAds
  process.env.JWT_SECRET = 'seller-ad-routes-test-secret-at-least-32-characters'
  const user = { id: 42, account_status: 'active', token_version: 0 }
  const requests = []
  userModel.findById = async () => user
  adModel.findOwnedAds = async (filters) => {
    requests.push(filters)
    return []
  }
  adModel.countOwnedAds = async (filters) => {
    requests.push(filters)
    return 0
  }

  const app = express()
  app.use('/api/seller', sellerRoutes)
  app.use(errorHandler)
  const server = http.createServer(app)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const token = jwt.sign({ sub: '42', tokenVersion: 0 }, process.env.JWT_SECRET)
  const baseUrl = `http://127.0.0.1:${server.address().port}/api/seller/ads`

  t.after(async () => {
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
    userModel.findById = originalFindById
    adModel.findOwnedAds = originalFindOwnedAds
    adModel.countOwnedAds = originalCountOwnedAds
    if (previousSecret === undefined) delete process.env.JWT_SECRET
    else process.env.JWT_SECRET = previousSecret
  })

  const request = (query) => fetch(`${baseUrl}${query}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const allStatuses = await request('?status=&userId=999&page=1&limit=20&sort=newest')
  assert.equal(allStatuses.status, 200)
  assert.deepEqual((await allStatuses.json()).advertisements, [])
  assert.equal(requests[0].userId, 42)
  assert.equal(requests[0].status, null)

  const suspended = await request('?status=suspended')
  assert.equal(suspended.status, 200)
  assert.equal(requests.at(-2).userId, 42)
  assert.equal(requests.at(-2).status, 'suspended')

  const changesRequested = await request('?status=changes_requested')
  assert.equal(changesRequested.status, 200)
  assert.equal(requests.at(-2).status, 'changes_requested')

  const invalid = await request('?status=invalid')
  assert.equal(invalid.status, 400)
  assert.equal((await invalid.json()).message, 'Choose a supported advertisement status.')
})
