function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function plainText(value = '') {
  return String(value).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

function slugify(value = '') {
  return plainText(value)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 170)
}

function advertisementPath(advertisement) {
  return `/ads/${slugify(advertisement.title) || 'advertisement'}-${advertisement.id}`
}

function safeJson(value) {
  return JSON.stringify(value).replaceAll('<', '\\u003c').replaceAll('>', '\\u003e').replaceAll('&', '\\u0026')
}

function getPublicSiteUrl() {
  const configured = process.env.PUBLIC_SITE_URL || 'http://localhost:5173'
  try {
    const url = new URL(configured)
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Unsupported protocol')
    return url.origin
  } catch {
    throw new Error('PUBLIC_SITE_URL must be an absolute HTTP or HTTPS origin.')
  }
}

module.exports = { advertisementPath, escapeHtml, getPublicSiteUrl, plainText, safeJson, slugify }
