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
  // Site routes and app sections
  'admin', 'api', 'seller', 'sellers', 'ads', 'ad', 'categories', 'category',
  'messages', 'dashboard', 'profile', 'profiles', 'account', 'account-settings', 'settings',
  'login', 'register', 'signup', 'sign-up', 'signin', 'sign-in', 'logout', 'verify', 'verify-email',
  'forgot-password', 'reset-password', 'payments', 'payment', 'checkout', 'notifications',
  'post-ad', 'recently-viewed', 'favourites', 'favorites', 'saved', 'wishlist', 'cart',
  'safety', 'contact', 'terms', 'privacy', 'search', 'uploads', 'static', 'assets', 'images',
  'sitemap', 'robots', 'robots.txt', 'sitemap.xml', 'health', 'tests', 'bachs', 'promotions',
  'promotion-packages', 'reports', 'analytics', 'verification', 'verifications', 'users', 'user',
  'me', 'you', 'my', 'new', 'edit', 'create', 'delete', 'update', 'settings', 'help', 'support',
  'about', 'blog', 'news', 'faq', 'careers', 'press', 'status', 'docs', 'pricing',
  // Brand and staff impersonation
  'jimvolt', 'jimvolt-support', 'jimvolt-admin', 'official', 'staff', 'team', 'moderator', 'moderators',
  'root', 'superuser', 'owner', 'system', 'billing', 'security', 'noreply', 'no-reply', 'postmaster',
  'abuse', 'legal', 'hello', 'info', 'mail', 'email',
  // Placeholder values that should never be a real handle
  'undefined', 'null', 'true', 'false', 'anonymous', 'unknown', 'deleted', 'guest', 'test',
  'seller-profile', 'public', 'private', 'www', 'app', 'web', 'mobile',
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
  if (isReservedUsername(normalised)) return 'That username is reserved. Please choose a different one.'
  return null
}

/**
 * Normalises a raw username value to the canonical stored form.
 * Lowercase, collapse non-alphanumeric runs to hyphens, strip leading/trailing hyphens.
 */
function normalizeUsername(value) {
  return slugify(value)
}

/** Returns true when the (normalised) username is on the reserved list. */
function isReservedUsername(value) {
  return RESERVED_SLUGS.has(String(value || '').toLowerCase())
}

/**
 * Suggests a starting username from a full name, e.g. "Ada Lovelace" -> "ada-lovelace".
 * Falls back to "member" when the name has no usable characters.
 */
function suggestUsername(fullName) {
  const base = slugify(fullName).slice(0, 40).replace(/-+$/, '')
  return base.length >= 3 && !isReservedUsername(base) ? base : 'member'
}

module.exports = { RESERVED_SLUGS, isReservedUsername, normalizeUsername, slugify, suggestUsername, validateUsername }
