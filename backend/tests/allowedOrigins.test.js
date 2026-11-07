const test = require('node:test')
const assert = require('node:assert/strict')
const { getAllowedOrigins } = require('../utils/allowedOrigins')

test('allows configured origins and Vercel deployment domains', () => {
  const origins = getAllowedOrigins({
    FRONTEND_URL: 'https://jimvolt.example, http://localhost:5173',
    VERCEL_URL: 'jimvolt-preview.vercel.app',
    VERCEL_PROJECT_PRODUCTION_URL: 'jimvolt.vercel.app',
  })

  assert.deepEqual([...origins], [
    'https://jimvolt.example',
    'http://localhost:5173',
    'https://jimvolt-preview.vercel.app',
    'https://jimvolt.vercel.app',
  ])
})

test('rejects invalid configured origins', () => {
  assert.throws(
    () => getAllowedOrigins({ FRONTEND_URL: 'ftp://jimvolt.example' }),
    /HTTP or HTTPS/,
  )
})
