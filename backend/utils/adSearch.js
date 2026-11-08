const sortOrders = Object.freeze({
  newest: 'a.created_at DESC, a.id DESC',
  oldest: 'a.created_at ASC, a.id ASC',
  price_asc: 'a.price ASC, a.created_at DESC',
  price_desc: 'a.price DESC, a.created_at DESC',
  most_viewed: 'a.views DESC, a.created_at DESC',
  popular: 'is_sponsored DESC, a.is_featured DESC, a.views DESC, a.created_at DESC',
})

function normalizeState(value) {
  const state = String(value || '').trim()
  if (/^(abuja|fct|federal capital territory|fct abuja)$/i.test(state)) return 'FCT Abuja'
  return state
}

function buildFilters(query) {
  const conditions = ["a.status = 'approved'"]
  const values = []
  const search = String(query.q || '').trim()

  if (search) {
    const terms = search.split(/\s+/).filter(Boolean).slice(0, 8)
    const likeColumns = ['a.title', 'a.description', 'a.brand', 'a.specifications', 'c.name']
    const tokenGroups = []
    const tokenValues = []
    for (const term of terms) {
      tokenGroups.push(`(${likeColumns.map((column) => `${column} LIKE ?`).join(' OR ')})`)
      tokenValues.push(...likeColumns.map(() => `%${term}%`))
    }

    const booleanSearch = terms
      .map((term) => term.replace(/[^\p{L}\p{N}]+/gu, ''))
      .filter((term) => term.length >= 3)
      .map((term) => `+${term}*`)
      .join(' ')
    const fullText = booleanSearch
      ? 'MATCH(a.title, a.description, a.brand, a.specifications) AGAINST (? IN BOOLEAN MODE)'
      : null

    conditions.push(fullText ? `(${fullText} OR (${tokenGroups.join(' AND ')}))` : `(${tokenGroups.join(' AND ')})`)
    if (fullText) values.push(booleanSearch)
    values.push(...tokenValues)
  }

  if (query.category) {
    conditions.push('(c.slug = ? OR c.id = ?)')
    values.push(String(query.category), /^\d+$/.test(String(query.category)) ? Number(query.category) : -1)
  }
  if (query.state) {
    conditions.push('LOWER(a.state) = LOWER(?)')
    values.push(normalizeState(query.state))
  }
  if (query.city) {
    conditions.push('LOWER(a.city) = LOWER(?)')
    values.push(String(query.city).trim())
  }
  if (query.condition) {
    conditions.push('a.condition_type = ?')
    values.push(String(query.condition).toLowerCase())
  }
  if (query.minPrice !== undefined && query.minPrice !== '') {
    conditions.push('a.price >= ?')
    values.push(Number(query.minPrice))
  }
  if (query.maxPrice !== undefined && query.maxPrice !== '') {
    conditions.push('a.price <= ?')
    values.push(Number(query.maxPrice))
  }
  if (query.verified !== undefined && query.verified !== '') {
    conditions.push('u.is_verified = ?')
    values.push(query.verified === 'true' ? 1 : 0)
  }
  if (query.featured !== undefined && query.featured !== '') {
    const featured = query.featured === 'true' || query.featured === '1'
    conditions.push(featured
      ? `(a.is_featured = ? OR EXISTS (SELECT 1 FROM promotions pr WHERE pr.advertisement_id = a.id
          AND pr.status = 'active' AND pr.expires_at > CURRENT_TIMESTAMP))`
      : `(a.is_featured = ? AND NOT EXISTS (SELECT 1 FROM promotions pr WHERE pr.advertisement_id = a.id
          AND pr.status = 'active' AND pr.expires_at > CURRENT_TIMESTAMP))`)
    values.push(featured ? 1 : 0)
  }
  if (query.recently === 'true') {
    conditions.push('a.created_at >= DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 7 DAY)')
  }

  return { where: `WHERE ${conditions.join(' AND ')}`, values }
}

module.exports = { buildFilters, normalizeState, sortOrders }
