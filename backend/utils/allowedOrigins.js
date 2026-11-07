function normalizeOrigin(value) {
  const candidate = value.includes('://') ? value : `https://${value}`
  const url = new URL(candidate)
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Configured frontend origins must use HTTP or HTTPS.')
  }
  return url.origin
}

function getAllowedOrigins(env = process.env) {
  const configuredOrigins = (env.FRONTEND_URL || 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
  const vercelOrigins = [env.VERCEL_URL, env.VERCEL_PROJECT_PRODUCTION_URL].filter(Boolean)
  return new Set([...configuredOrigins, ...vercelOrigins].map(normalizeOrigin))
}

module.exports = { getAllowedOrigins }
