const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const test = require('node:test')
const { toKobo } = require('../services/paystackService')
const { verifyPaystackSignature } = require('../utils/paystackWebhook')

test('converts configured promotion prices to exact kobo amounts', () => {
  assert.equal(toKobo('2000'), 200000)
  assert.equal(toKobo('5000.25'), 500025)
  assert.throws(() => toKobo('1.001'), { statusCode: 400 })
})

test('validates Paystack webhook signatures and rejects altered payloads', () => {
  const body = Buffer.from('{"event":"charge.success"}')
  const secret = 'test-webhook-secret'
  const signature = crypto.createHmac('sha512', secret).update(body).digest('hex')

  assert.equal(verifyPaystackSignature(body, signature, secret), true)
  assert.equal(verifyPaystackSignature(Buffer.from('{"event":"charge.failed"}'), signature, secret), false)
  assert.equal(verifyPaystackSignature(body, 'not-a-signature', secret), false)
})