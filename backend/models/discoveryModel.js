const { pool } = require('../config/database')

function formatNaira(value) {
  return `₦${Number(value).toLocaleString('en-NG', { maximumFractionDigits: 2 })}`
}

async function recordPriceChange(connection, { id, title, oldPrice, newPrice }) {
  if (Number(oldPrice) === Number(newPrice)) return false
  const [history] = await connection.execute(
    `INSERT INTO price_history (advertisement_id, old_price, new_price)
     VALUES (?, ?, ?)`,
    [id, oldPrice, newPrice],
  )
  if (Number(newPrice) >= Number(oldPrice)) return true

  const body = `Good news! The price of ${title} has dropped from ${formatNaira(oldPrice)} to ${formatNaira(newPrice)}.`
  await connection.execute(
    `INSERT IGNORE INTO notifications
       (user_id, type, title, body, related_advertisement_id, dedupe_key)
     SELECT f.user_id, 'price_drop', 'A saved product price dropped', ?, ?, ?
     FROM favourites f
     LEFT JOIN wishlist_preferences wp ON wp.user_id = f.user_id
     WHERE f.advertisement_id = ? AND COALESCE(wp.notify_price_drops, TRUE) = TRUE`,
    [body, id, `price-drop-${history.insertId}`, id],
  )
  return true
}

async function notifyAvailability(connection, { id, title, status }) {
  const message = status === 'approved'
    ? `${title} is available again.`
    : `${title} is no longer available (${status.replaceAll('_', ' ')}).`
  await connection.execute(
    `INSERT INTO notifications (user_id, type, title, body, related_advertisement_id)
     SELECT user_id, 'saved_ad_availability', 'Saved product availability changed', ?, ?
     FROM favourites WHERE advertisement_id = ?`,
    [message, id, id],
  )
}

async function addFavorite(userId, advertisementId) {
  const [rows] = await pool.execute(
    `SELECT a.id, a.title, a.price, a.condition_type, a.state, a.city, a.category_id,
            u.full_name AS seller_name,
            (SELECT pi.image_url FROM product_images pi
             WHERE pi.advertisement_id = a.id ORDER BY pi.id LIMIT 1) AS image
     FROM advertisements a JOIN users u ON u.id = a.user_id
     WHERE a.id = ? AND a.status = 'approved' LIMIT 1`,
    [advertisementId],
  )
  if (!rows.length) return null
  const ad = rows[0]
  const [result] = await pool.execute(
    `INSERT IGNORE INTO favourites
      (user_id, advertisement_id, saved_title, saved_price, saved_condition_type,
       saved_state, saved_city, saved_image, saved_seller_name, saved_category_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [userId, advertisementId, ad.title, ad.price, ad.condition_type, ad.state,
      ad.city, ad.image, ad.seller_name, ad.category_id],
  )
  return { added: result.affectedRows > 0 }
}

async function listFavorites(userId, { q = '', category, sort = 'newest', page = 1, limit = 20 }) {
  const where = ['f.user_id = ?']
  const values = [userId]
  if (q) {
    where.push('(COALESCE(a.title, f.saved_title) ILIKE ? OR COALESCE(u.full_name, f.saved_seller_name) ILIKE ?)')
    values.push(`%${q}%`, `%${q}%`)
  }
  if (category) {
    where.push('COALESCE(a.category_id, f.saved_category_id) = ?')
    values.push(category)
  }
  const orderBy = {
    newest: 'f.created_at DESC, f.id DESC',
    price_asc: 'COALESCE(a.price, f.saved_price) ASC, f.created_at DESC',
    price_desc: 'COALESCE(a.price, f.saved_price) DESC, f.created_at DESC',
  }[sort] || 'f.created_at DESC, f.id DESC'
  const [rows] = await pool.execute(
    `SELECT f.id AS favorite_id, f.advertisement_id, f.created_at AS favorited_at,
            COALESCE(a.title, f.saved_title, 'Removed advertisement') AS title,
            COALESCE(a.price, f.saved_price) AS price,
            COALESCE(a.condition_type, f.saved_condition_type) AS condition_type,
            COALESCE(a.state, f.saved_state) AS state,
            COALESCE(a.city, f.saved_city) AS city,
            COALESCE(u.full_name, f.saved_seller_name) AS seller_name,
            a.status AS advertisement_status, a.slug, c.name AS category_name,
            COALESCE(a.category_id, f.saved_category_id) AS category_id,
            COALESCE((SELECT pi.image_url FROM product_images pi
              WHERE pi.advertisement_id = a.id ORDER BY pi.id LIMIT 1), f.saved_image) AS image
     FROM favourites f
     LEFT JOIN advertisements a ON a.id = f.advertisement_id
     LEFT JOIN users u ON u.id = a.user_id
     LEFT JOIN categories c ON c.id = COALESCE(a.category_id, f.saved_category_id)
     WHERE ${where.join(' AND ')}
     ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
    [...values, limit, (page - 1) * limit],
  )
  const [count] = await pool.execute(
    `SELECT COUNT(*) AS total FROM favourites f
     LEFT JOIN advertisements a ON a.id = f.advertisement_id
     LEFT JOIN users u ON u.id = a.user_id
     WHERE ${where.join(' AND ')}`,
    values,
  )
  return {
    favorites: rows.map((row) => ({
      ...row,
      available: row.advertisement_status === 'approved',
      unavailableReason: row.advertisement_id === null ? 'removed'
        : row.advertisement_status === 'suspended' ? 'suspended'
          : row.advertisement_status === 'sold' ? 'sold'
            : row.advertisement_status === 'expired' ? 'expired'
              : row.advertisement_status === 'approved' ? null : 'not_available',
    })),
    total: Number(count[0].total),
  }
}

async function removeFavorite(userId, advertisementId) {
  const [result] = await pool.execute(
    'DELETE FROM favourites WHERE user_id = ? AND advertisement_id = ?',
    [userId, advertisementId],
  )
  return result.affectedRows > 0
}

async function removeFavoriteById(userId, favoriteId) {
  const [result] = await pool.execute(
    'DELETE FROM favourites WHERE user_id = ? AND id = ?',
    [userId, favoriteId],
  )
  return result.affectedRows > 0
}

async function clearFavorites(userId) {
  const [result] = await pool.execute('DELETE FROM favourites WHERE user_id = ?', [userId])
  return result.affectedRows
}

async function favoriteCount(userId) {
  const [rows] = await pool.execute('SELECT COUNT(*) AS total FROM favourites WHERE user_id = ?', [userId])
  return Number(rows[0].total || 0)
}

async function favoriteIds(userId) {
  const [rows] = await pool.execute(
    'SELECT advertisement_id FROM favourites WHERE user_id = ? AND advertisement_id IS NOT NULL',
    [userId],
  )
  return rows.map((row) => String(row.advertisement_id))
}

async function trackView(userId, advertisementId) {
  const [result] = await pool.execute(
    `INSERT INTO recently_viewed (user_id, advertisement_id, viewed_at)
     VALUES (?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT (user_id, advertisement_id) DO UPDATE SET viewed_at = CURRENT_TIMESTAMP`,
    [userId, advertisementId],
  )
  return result.affectedRows > 0
}

async function importRecentlyViewed(userId, advertisementIds) {
  const uniqueIds = [...new Set(advertisementIds.map(Number))]
  let imported = 0
  for (const id of uniqueIds) {
    const [available] = await pool.execute(
      "SELECT id FROM advertisements WHERE id = ? AND status = 'approved' LIMIT 1",
      [id],
    )
    if (available.length) {
      await trackView(userId, id)
      imported += 1
    }
  }
  return imported
}

async function listRecentlyViewed(userId, { page = 1, limit = 20 }) {
  const [rows] = await pool.execute(
    `SELECT rv.id, rv.advertisement_id, rv.viewed_at,
            COALESCE(a.title, 'Unavailable advertisement') AS title,
            a.price, a.condition_type, a.state, a.city, a.status AS advertisement_status,
            u.full_name AS seller_name,
            (SELECT pi.image_url FROM product_images pi
             WHERE pi.advertisement_id = a.id ORDER BY pi.id LIMIT 1) AS image
     FROM recently_viewed rv
     LEFT JOIN advertisements a ON a.id = rv.advertisement_id
     LEFT JOIN users u ON u.id = a.user_id
     WHERE rv.user_id = ?
     ORDER BY rv.viewed_at DESC, rv.id DESC LIMIT ? OFFSET ?`,
    [userId, limit, (page - 1) * limit],
  )
  const [count] = await pool.execute(
    'SELECT COUNT(*) AS total FROM recently_viewed WHERE user_id = ?',
    [userId],
  )
  return {
    items: rows.map((row) => ({
      ...row,
      available: row.advertisement_status === 'approved',
    })),
    total: Number(count[0].total),
  }
}

async function removeRecentlyViewed(userId, advertisementId) {
  const [result] = await pool.execute(
    'DELETE FROM recently_viewed WHERE user_id = ? AND advertisement_id = ?',
    [userId, advertisementId],
  )
  return result.affectedRows > 0
}

async function clearRecentlyViewed(userId) {
  const [result] = await pool.execute('DELETE FROM recently_viewed WHERE user_id = ?', [userId])
  return result.affectedRows
}

async function getPreferences(userId) {
  await pool.execute(`INSERT IGNORE INTO wishlist_preferences (user_id) VALUES (?)`, [userId])
  const [preferences] = await pool.execute(
    'SELECT notify_price_drops FROM wishlist_preferences WHERE user_id = ?',
    [userId],
  )
  return { notifyPriceDrops: Boolean(preferences[0]?.notify_price_drops ?? true) }
}

async function setPreferences(userId, notifyPriceDrops) {
  await pool.execute(
    `INSERT INTO wishlist_preferences (user_id, notify_price_drops)
     VALUES (?, ?) ON CONFLICT (user_id) DO UPDATE SET notify_price_drops = EXCLUDED.notify_price_drops`,
    [userId, notifyPriceDrops],
  )
  return { notifyPriceDrops: Boolean(notifyPriceDrops) }
}

async function getPriceHistory(advertisementId) {
  const [rows] = await pool.execute(
    `SELECT old_price, new_price, changed_at FROM price_history
     WHERE advertisement_id = ? ORDER BY changed_at DESC, id DESC LIMIT 100`,
    [advertisementId],
  )
  return rows
}

module.exports = {
  addFavorite,
  clearFavorites,
  clearRecentlyViewed,
  favoriteCount,
  favoriteIds,
  getPreferences,
  getPriceHistory,
  importRecentlyViewed,
  listFavorites,
  listRecentlyViewed,
  removeFavorite,
  removeFavoriteById,
  removeRecentlyViewed,
  notifyAvailability,
  recordPriceChange,
  setPreferences,
  trackView,
}
