const assert = require('node:assert/strict')
const test = require('node:test')

const emailService = require('../services/emailService')

async function withEnv(values, fn) {
  const original = {}
  for (const key of Object.keys(values)) {
    original[key] = process.env[key]
    if (values[key] === undefined) delete process.env[key]
    else process.env[key] = values[key]
  }
  try {
    return await fn()
  } finally {
    for (const key of Object.keys(original)) {
      if (original[key] === undefined) delete process.env[key]
      else process.env[key] = original[key]
    }
  }
}

test('without RESEND_API_KEY, reset and welcome emails are logged and return a preview link', async () => {
  const logged = []
  const originalLog = console.log
  console.log = (message) => logged.push(String(message))
  try {
    await withEnv({ RESEND_API_KEY: undefined }, async () => {
      const reset = await emailService.sendPasswordResetEmail('buyer@example.com', 'https://site.test/reset-password?token=abc')
      assert.equal(reset.ok, true)
      assert.equal(reset.preview, 'https://site.test/reset-password?token=abc')

      const welcome = await emailService.sendWelcomeEmail('buyer@example.com', 'Ada')
      assert.equal(welcome.ok, true)
    })
  } finally {
    console.log = originalLog
  }
  assert.ok(logged.some((line) => line.includes('Password reset requested') && line.includes('buyer@example.com')))
  assert.ok(logged.some((line) => line.includes('Welcome email')))
})
