const test = require('node:test')
const assert = require('node:assert/strict')
const express = require('express')
const bachsTestRoutes = require('../routes/bachsTestRoutes')

test('Bachs test checkout validates amounts and requires a sandbox key', async () => {
  const previousApiKey = process.env.BACHS_API_KEY
  delete process.env.BACHS_API_KEY

  const app = express()
  app.use(express.json())
  app.use('/api/tests/bachs', bachsTestRoutes)
  const server = app.listen(0)

  try {
    await new Promise((resolve) => server.once('listening', resolve))
    const { port } = server.address()
    const request = (amount) => fetch(`http://127.0.0.1:${port}/api/tests/bachs/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount }),
    })

    const invalidAmount = await request('0')
    assert.equal(invalidAmount.status, 400)
    assert.match((await invalidAmount.json()).message, /greater than zero/)

    const missingSandboxKey = await request('1000.50')
    assert.equal(missingSandboxKey.status, 503)
    assert.match((await missingSandboxKey.json()).message, /sandbox API key/)

    process.env.BACHS_API_KEY = 'sk_live_not-for-tests'
    const liveKey = await request('1000')
    assert.equal(liveKey.status, 503)
  } finally {
    if (previousApiKey === undefined) delete process.env.BACHS_API_KEY
    else process.env.BACHS_API_KEY = previousApiKey
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  }
})
