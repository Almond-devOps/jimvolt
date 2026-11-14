/**
 * Slug generation and reservation utilities for public seller profile URLs.
 *
 * Rules enforced here:
 *   – Lowercase letters, digits, hyphens only
 *   – 3–48 characters (after normalisation)
 *   – Cannot be a reserved word (protects against impersonation / confusion)
 *   – Uniqueness is enforced by the database UNIQUE constraint; this module
 *     generates candidates and delegates the final uniqueness check to the DB.
 */

/** Words that must never be used as a public seller slug. */
const RESERVED_SLUGS = new Set([
  'admin', 'api', 'seller', 'sellers', 'ads', 'categories', 'category',
  'messages', 'dashboard', 'profile', 'account-settings', 'login', 'register',
  'logout', 'verify-email', 'forgot-password', 'reset-password', 'payments',
  'notifications', 'post-ad', 'recently-viewed', 'favourites', 'saved',
  'safety', 'contact', 'terms', 'privacy', 'search', 'uploads', 'static',
  'sitemap', 'robots', 'robots.txt', 'sitemap.xml', 'health', 'tests',
  'jimvolt', 'support', 'help', 'about', 'blog', 'news', 'undefined',
  'null', 'true', 'false', 'anonymous', 'unknown',
])

/**
 * Converts an arbitrary string into a URL-safe slug fragment.
 * Returns 'seller' as a fallback when nothing usable remains.
 */
function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // strip combining diacritics
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || 'seller'
}

/**
 * Validates a caller-supplied username string.
 * Returns null when valid; returns an error message string when invalid.
 */
function validateUsername(value) {
  if (!value || typeof value !== 'string') return 'Username is required.'
  const trimmed = value.trim()
  if (trimmed.length < 3) return 'Username must be at least 3 characters.'
  if (trimmed.length > 48) return 'Username must be 48 characters or fewer.'
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/i.test(trimmed) && !/^[a-z0-9]$/i.test(trimmed)) {
    return 'Username may only contain letters, numbers, and hyphens, and may not start or end with a hyphen.'
  }
  if (/--/.test(trimmed)) return 'Username may not contain consecutive hyphens.'
  const normalised = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  if (RESERVED_SLUGS.has(normalised)) return 'That username is reserved. Please choose a different one.'
  return null
}

/**
 * Normalises a raw username value to the canonical stored form.
 * Lowercase, collapse non-alphanumeric runs to hyphens, strip leading/trailing hyphens.
 */
function normalizeUsername(value) {
  return slugify(value)
}

module.exports = { RESERVED_SLUGS, normalizeUsername, slugify, validateUsername }
