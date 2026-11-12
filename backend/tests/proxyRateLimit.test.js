const assert = require('node:assert/strict')
const test = require('node:test')
const express = require('express')
const http = require('node:http')
const { rateLimit } = require('../utils/rateLimit')

test('Vercel client addresses have separate quotas and Forwarded cannot bypass them', async (t) => {
  const oldVercel = process.env.VERCEL
  process.env.VERCEL = '1'
  t.after(() => {
    if (oldVercel === undefined) delete process.env.VERCEL
    else process.env.VERCEL = oldVercel
  })
  const { app: backend } = require('../server')
  assert.equal(backend.get('trust proxy'), 1)
  const app = express()
  app.set('trust proxy', backend.get('trust proxy'))
  app.use(rateLimit({ windowMs: 60000, limit: 1, standardHeaders: 'draft-8', legacyHeaders: false }))
  app.get('/', (req, res) => res.json({ ip: req.ip }))
  const server = http.createServer(app)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  t.after(async () => {
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
  })
  const address = `http://127.0.0.1:${server.address().port}`
  const request = (ip, forwarded) => fetch(address, { headers: {
    'x-forwarded-for': ip, forwarded: `for=${forwarded}`,
  } })
  const first = await request('198.51.100.1', '203.0.113.1')
  assert.equal(first.status, 200)
  assert.equal((await first.json()).ip, '198.51.100.1')
  assert.equal((await request('198.51.100.2', '203.0.113.1')).status, 200)
  assert.equal((await request('198.51.100.1', '203.0.113.99')).status, 429)
})
