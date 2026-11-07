const { app, initializeBackend } = require('../backend/server')

module.exports = async function handler(req, res) {
  try {
    await initializeBackend()

    const requestUrl = new URL(req.url, 'https://vercel.local')
    const originalPath = requestUrl.searchParams.get('__vercel_path')
    const routedPath = originalPath === '/'
      || /^\/(?:api|uploads|ads|sellers|seller|category)\//.test(originalPath || '')
      || /^\/(?:robots\.txt|sitemap(?:-\d+)?\.xml)$/.test(originalPath || '')
    if (routedPath) {
      requestUrl.searchParams.delete('__vercel_path')
      req.url = `${originalPath}${requestUrl.search}`
    }

    return app(req, res)
  } catch (error) {
    console.error('Vercel API initialization failed:', error)
    return res.status(503).json({ message: 'The API is temporarily unavailable.' })
  }
}
