const { pool } = require('../config/database')
const discoveryModel = require('./discoveryModel')

const detailsQuery = `
  SELECT a.id, a.user_id, a.category_id, a.title, a.brand, a.specifications, a.slug, a.description,
         a.price, a.condition_type, a.state, a.city, a.phone, a.whatsapp,
         a.status, a.views, a.is_featured, a.created_at, a.updated_at,
         EXISTS (SELECT 1 FROM promotions pr WHERE pr.advertisement_id = a.id
           AND pr.status = 'active' AND pr.expires_at > CURRENT_TIMESTAMP) AS is_sponsored,
         (SELECT MAX(pr.expires_at) FROM promotions pr WHERE pr.advertisement_id = a.id
           AND pr.status = 'active' AND pr.expires_at > CURRENT_TIMESTAMP) AS promotion_expires_at,
         c.name AS category_name, c.slug AS category_slug,
         u.full_name AS seller_name, u.phone AS seller_phone,
         u.profile_image AS seller_profile_image,
         (SELECT sv.status = 'verified' FROM seller_verifications sv
          WHERE sv.user_id = u.id ORDER BY sv.id DESC LIMIT 1) AS seller_is_verified
  FROM advertisements a
  JOIN categories c ON c.id = a.category_id
  JOIN users u ON u.id = a.user_id
`

async function attachImages(rows) {
  if (!rows.length) return rows
  const ids = rows.map((row) => row.id)
  const placeholders = ids.map(() => '?').join(', ')
  const [images] = await pool.execute(
    `SELECT advertisement_id, image_url FROM product_images
     WHERE advertisement_id IN (${placeholders}) ORDER BY id`,
    ids,
  )
  const imageMap = new Map(ids.map((id) => [id, []]))
  for (const image of images) imageMap.get(image.advertisement_id)?.push(image.image_url)

  // One grouped query for every seller on the page, so cards can show the seller rating.
  const sellerIds = [...new Set(rows.map((row) => row.user_id))]
  const [ratingRows] = await pool.execute(
    `SELECT seller_id, AVG(score) AS average, COUNT(*) AS count FROM seller_ratings
     WHERE seller_id IN (${sellerIds.map(() => '?').join(', ')}) GROUP BY seller_id`,
    sellerIds,
  )
  const ratingMap = new Map(ratingRows.map((rating) => [Number(rating.seller_id), {
    average: Number(rating.average), count: Number(rating.count),
  }]))

  return rows.map(({ user_id, category_id, ...row }) => ({
    ...row,
    category: { id: category_id, name: row.category_name, slug: row.category_slug },
    seller: {
      id: user_id,
      name: row.seller_name,
      phone: row.seller_phone,
      profileImage: row.seller_profile_image,
      is_verified: Boolean(row.seller_is_verified),
      rating: ratingMap.get(Number(user_id)) || { average: null, count: 0 },
    },
    images: imageMap.get(row.id) || [],
  }))
}

async function findPublic({ where = "WHERE a.status = 'approved'", values = [], orderBy = 'a.created_at DESC, a.id DESC', limit = 20, offset = 0 }) {
  const [rows] = await pool.execute(
    `${detailsQuery}
     ${where}
     ORDER BY ${orderBy}
     LIMIT ? OFFSET ?`,
    [...values, limit, offset],
  )
  return attachImages(rows)
}

async function countPublic({ where = "WHERE a.status = 'approved'", values = [] }) {
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS total
     FROM advertisements a
     JOIN categories c ON c.id = a.category_id
     JOIN users u ON u.id = a.user_id
     ${where}`,
    values,
  )
  return Number(rows[0].total)
}

async function findSearchSuggestions(search, limit = 8) {
  const terms = String(search).trim().split(/\s+/).filter(Boolean).slice(0, 8)
  if (!terms.length) return []
  const columns = ['a.title', 'a.description', 'a.brand', 'a.specifications', 'c.name']
  const conditions = []
  const values = []
  for (const term of terms) {
    conditions.push(`(${columns.map((column) => `${column} LIKE ?`).join(' OR ')})`)
    values.push(...columns.map(() => `%${term}%`))
  }
  const [rows] = await pool.execute(
    `SELECT a.id, a.title, a.brand, a.price, a.state, a.city,
            c.name AS category_name, c.slug AS category_slug
     FROM advertisements a
     JOIN categories c ON c.id = a.category_id
     WHERE a.status = 'approved' AND ${conditions.join(' AND ')}
    ORDER BY is_sponsored DESC, a.is_featured DESC, a.views DESC, a.created_at DESC
     LIMIT ?`,
    [...values, limit],
  )
  return rows
}

async function findCitiesByState(state) {
  const [rows] = await pool.execute(
    `SELECT DISTINCT city
     FROM advertisements
     WHERE status = 'approved' AND LOWER(state) = LOWER(?)
     ORDER BY city ASC
     LIMIT 100`,
    [state],
  )
  return rows.map((row) => row.city)
}

async function findPopularLocations(limit = 8) {
  const [rows] = await pool.execute(
    `SELECT state AS name, COUNT(*) AS count
     FROM advertisements
     WHERE status = 'approved'
     GROUP BY state
     ORDER BY COUNT(*) DESC, state ASC
     LIMIT ?`,
    [limit],
  )
  return rows.map((row) => ({ name: row.name, count: Number(row.count) }))
}

async function findPublicById(id) {
  const [rows] = await pool.execute(
    `${detailsQuery} WHERE a.id = ? AND a.status = 'approved' LIMIT 1`,
    [id],
  )
  return (await attachImages(rows))[0] || null
}

async function findPublicByIds(ids) {
  if (!ids.length) return []
  const placeholders = ids.map(() => '?').join(', ')
  const [rows] = await pool.execute(
    `${detailsQuery} WHERE a.id IN (${placeholders}) AND a.status = 'approved'`,
    ids,
  )
  const advertisements = await attachImages(rows)
  const byId = new Map(advertisements.map((ad) => [String(ad.id), ad]))
  return ids.map((id) => byId.get(String(id))).filter(Boolean)
}

async function findPublicBySeller(userId) {
  const [rows] = await pool.execute(
    `${detailsQuery} WHERE a.user_id = ? AND a.status = 'approved' ORDER BY a.created_at DESC`,
    [userId],
  )
  return attachImages(rows)
}

async function incrementViews(id) {
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const [result] = await connection.execute(
      "UPDATE advertisements SET views = views + 1 WHERE id = ? AND status = 'approved'",
      [id],
    )
    if (result.affectedRows) {
      await connection.execute(
        "INSERT INTO advertisement_analytics (advertisement_id, event_type) VALUES (?, 'view')",
        [id],
      )
    }
    await connection.commit()
    return result.affectedRows > 0
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}

async function findByUser(userId) {
  const [rows] = await pool.execute(
    `${detailsQuery} WHERE a.user_id = ? ORDER BY a.created_at DESC`,
    [userId],
  )
  return attachImages(rows)
}

async function findOwnedById(id, userId) {
  const [rows] = await pool.execute(
    `${detailsQuery} WHERE a.id = ? AND a.user_id = ? LIMIT 1`,
    [id, userId],
  )
  return (await attachImages(rows))[0] || null
}

async function findOwnedAds({ userId, status, search, sortBy, limit, offset }) {
  const where = ['a.user_id = ?']
  const values = [userId]
  if (status) {
    where.push('a.status = ?')
    values.push(status)
  }
  if (search) {
    where.push(`(a.title LIKE ? OR a.brand LIKE ? OR a.description LIKE ?
      OR c.name LIKE ? OR a.state LIKE ? OR a.city LIKE ?)`)
    values.push(...Array(6).fill(`%${search}%`))
  }
  const orderBy = {
    newest: 'a.created_at DESC, a.id DESC',
    oldest: 'a.created_at ASC, a.id ASC',
    views: 'a.views DESC, a.created_at DESC',
    price_asc: 'a.price ASC, a.created_at DESC',
    price_desc: 'a.price DESC, a.created_at DESC',
  }[sortBy] || 'a.created_at DESC, a.id DESC'
  const [rows] = await pool.execute(
    `${detailsQuery} WHERE ${where.join(' AND ')} ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
    [...values, limit, offset],
  )
  const ads = await attachImages(rows)
  if (!ads.length) return ads
  const ids = ads.map((ad) => ad.id)
  const placeholders = ids.map(() => '?').join(', ')
  const [enquiries] = await pool.execute(
    `SELECT advertisement_id, COUNT(*) AS total
     FROM messages WHERE receiver_id = ? AND advertisement_id IN (${placeholders})
     GROUP BY advertisement_id`,
    [userId, ...ids],
  )
  const enquiryCounts = new Map(enquiries.map((row) => [String(row.advertisement_id), Number(row.total)]))
  return ads.map((ad) => ({ ...ad, enquiries: enquiryCounts.get(String(ad.id)) || 0 }))
}

async function countOwnedAds({ userId, status, search }) {
  const where = ['user_id = ?']
  const values = [userId]
  if (status) {
    where.push('status = ?')
    values.push(status)
  }
  if (search) {
    where.push(`(title LIKE ? OR brand LIKE ? OR description LIKE ?
      OR category_id IN (SELECT id FROM categories WHERE name LIKE ?)
      OR state LIKE ? OR city LIKE ?)`)
    values.push(...Array(6).fill(`%${search}%`))
  }
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS total FROM advertisements WHERE ${where.join(' AND ')}`,
    values,
  )
  return Number(rows[0].total)
}

async function setOwnedStatus(id, userId, status) {
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const [rows] = await connection.execute(
      `SELECT id, title, status FROM advertisements
       WHERE id = ? AND user_id = ? FOR UPDATE`,
      [id, userId],
    )
    if (!rows.length || !['approved', 'paused', 'sold'].includes(rows[0].status)
      || !['paused', 'approved', 'sold'].includes(status)) {
      await connection.rollback()
      return false
    }
    const ad = rows[0]
    if (ad.status !== status) {
      await connection.execute('UPDATE advertisements SET status = ? WHERE id = ?', [status, id])
      if ((ad.status === 'approved') !== (status === 'approved')) {
        await discoveryModel.notifyAvailability(connection, { id, title: ad.title, status })
      }
    }
    await connection.commit()
    return true
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}

async function duplicateOwned(id, userId, slug) {
  const source = await findOwnedById(id, userId)
  if (!source) return null
  const newId = await create({
    userId,
    categoryId: source.category.id,
    title: source.title,
    brand: source.brand,
    specifications: source.specifications,
    slug,
    description: source.description,
    price: source.price,
    conditionType: source.condition_type,
    state: source.state,
    city: source.city,
    phone: source.phone,
    whatsapp: source.whatsapp,
    images: source.images,
  })
  return newId
}

async function findPending() {
  const [rows] = await pool.execute(
    `${detailsQuery} WHERE a.status = 'pending' ORDER BY a.created_at ASC`,
  )
  return attachImages(rows)
}

async function setModerationStatus(id, status) {
  const [result] = await pool.execute(
    'UPDATE advertisements SET status = ? WHERE id = ? AND status = ?',
    [status, id, 'pending'],
  )
  return result.affectedRows > 0
}

async function create({ userId, categoryId, title, brand, specifications, slug, description, price, conditionType, state, city, phone, whatsapp, images }) {
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const [result] = await connection.execute(
      `INSERT INTO advertisements
       (user_id, category_id, title, brand, specifications, slug, description, price, condition_type, state, city, phone, whatsapp, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [userId, categoryId, title, brand || null, specifications || null, slug, description, price, conditionType, state, city, phone, whatsapp || null],
    )
    for (const image of images) {
      await connection.execute(
        'INSERT INTO product_images (advertisement_id, image_url) VALUES (?, ?)',
        [result.insertId, image],
      )
    }
    await connection.commit()
    return result.insertId
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}

async function updateOwned(id, userId, { categoryId, title, brand, specifications, slug, description, price, conditionType, state, city, phone, whatsapp, images }) {
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const [currentRows] = await connection.execute(
      'SELECT id, title, price, status FROM advertisements WHERE id = ? AND user_id = ? FOR UPDATE',
      [id, userId],
    )
    if (!currentRows.length) {
      await connection.rollback()
      return false
    }
    const current = currentRows[0]
    const [result] = await connection.execute(
      `UPDATE advertisements
       SET category_id = ?, title = ?, brand = ?, specifications = ?, slug = ?, description = ?, price = ?,
           condition_type = ?, state = ?, city = ?, phone = ?, whatsapp = ?,
           status = 'pending'
       WHERE id = ? AND user_id = ?`,
      [categoryId, title, brand || null, specifications || null, slug, description, price, conditionType, state, city, phone, whatsapp || null, id, userId],
    )
    if (result.affectedRows === 0) {
      await connection.rollback()
      return false
    }
    await discoveryModel.recordPriceChange(connection, {
      id,
      title,
      oldPrice: current.price,
      newPrice: price,
    })
    if (current.status === 'approved') {
      await discoveryModel.notifyAvailability(connection, { id, title: current.title, status: 'pending' })
    }
    await connection.execute('DELETE FROM product_images WHERE advertisement_id = ?', [id])
    for (const image of images) {
      await connection.execute(
        'INSERT INTO product_images (advertisement_id, image_url) VALUES (?, ?)',
        [id, image],
      )
    }
    const [imageRows] = await connection.execute(
      'SELECT image_url FROM product_images WHERE advertisement_id = ? ORDER BY id LIMIT 1',
      [id],
    )
    await connection.execute(
      `UPDATE favourites SET saved_title = ?, saved_price = ?, saved_condition_type = ?,
       saved_state = ?, saved_city = ?, saved_image = ?, saved_seller_name =
         (SELECT full_name FROM users WHERE id = ?), saved_category_id = ?
       WHERE advertisement_id = ?`,
      [title, price, conditionType, state, city, imageRows[0]?.image_url || null,
        userId, categoryId, id],
    )
    await connection.commit()
    return true
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}

async function deleteOwned(id, userId) {
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const [rows] = await connection.execute(
      'SELECT id, title FROM advertisements WHERE id = ? AND user_id = ? FOR UPDATE',
      [id, userId],
    )
    if (!rows.length) {
      await connection.rollback()
      return false
    }
    await discoveryModel.notifyAvailability(connection, {
      id, title: rows[0].title, status: 'removed',
    })
    const [result] = await connection.execute(
      'DELETE FROM advertisements WHERE id = ? AND user_id = ?',
      [id, userId],
    )
    await connection.commit()
    return result.affectedRows > 0
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}

module.exports = {
  countPublic,
  create,
  deleteOwned,
  findByUser,
  findOwnedAds,
  findOwnedById,
  findCitiesByState,
  findPending,
  findPopularLocations,
  findPublic,
  findPublicById,
  findPublicByIds,
  findPublicBySeller,
  findSearchSuggestions,
  incrementViews,
  countOwnedAds,
  duplicateOwned,
  setOwnedStatus,
  updateOwned,
  setModerationStatus,
}
