const { rateLimit: createRateLimit } = require('express-rate-limit')

function rateLimit(options) {
  return createRateLimit({
    ...options,
    // Vercel's overwritten X-Forwarded-For is authoritative. Forwarded is not
    // used for identity, so it must not trigger the unsupported-header warning.
    ...(process.env.VERCEL === '1' ? { validate: { forwardedHeader: false } } : {}),
  })
}

module.exports = { rateLimit }
