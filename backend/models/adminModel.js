const { pool } = require('../config/database')
const discoveryModel = require('./discoveryModel')

function json(value) {
  return value === undefined || value === null ? null : JSON.stringify(value)
}

async function writeAudit({
  administratorId, action, entityType, entityId, previousValue, newValue, ipAddress, userAgent,
}) {
  await pool.execute(
    `INSERT INTO admin_audit_logs
       (administrator_id, action, entity_type, entity_id, previous_value, new_value, ip_address, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [administratorId || null, action, entityType, entityId || null, json(previousValue),
      json(newValue), ipAddress || null, userAgent?.slice(0, 500) || null],
  )
}

async function getDashboard() {
  const [userRows] = await pool.query(
    `SELECT COUNT(*) AS total_users,
            SUM(role = 'user' AND account_status = 'active') AS active_users,
            SUM(account_status = 'suspended') AS suspended_users,
            SUM(role IN ('admin', 'super_admin')) AS administrators
     FROM users`,
  )
  const [sellerRows] = await pool.query(
    `SELECT COUNT(DISTINCT user_id) AS sellers FROM (
       SELECT user_id FROM advertisements
       UNION SELECT user_id FROM seller_profiles
     ) seller_accounts`,
  )
  const [adRows] = await pool.query(
    `SELECT COUNT(*) AS total_ads,
            SUM(status = 'approved') AS approved_ads,
            SUM(status = 'pending') AS pending_ads,
            SUM(status = 'rejected') AS rejected_ads,
            SUM(status = 'suspended') AS suspended_ads
     FROM advertisements`,
  )
  const [verificationRows] = await pool.query(
    `SELECT COUNT(*) AS total FROM seller_verifications sv
     WHERE sv.status = 'verified' AND sv.id = (
       SELECT MAX(latest.id) FROM seller_verifications latest WHERE latest.user_id = sv.user_id
     )`,
  )
  const [reportRows] = await pool.query(
    `SELECT COUNT(*) AS total_reports,
            SUM(status IN ('open', 'investigating')) AS open_reports
     FROM reports`,
  )
  const [paymentRows] = await pool.query(
    `SELECT COALESCE(SUM(amount), 0) AS revenue, COUNT(*) AS successful_payments
     FROM payment_transactions WHERE status = 'succeeded' AND verified_at IS NOT NULL`,
  )
  const [recentUsers] = await pool.query(
    `SELECT id, full_name, email, role, account_status, created_at
     FROM users ORDER BY created_at DESC LIMIT 6`,
  )
  const [recentAds] = await pool.query(
    `SELECT a.id, a.title, a.price, a.status, a.created_at, u.full_name AS seller_name,
            c.name AS category_name
     FROM advertisements a JOIN users u ON u.id = a.user_id
     JOIN categories c ON c.id = a.category_id
     ORDER BY a.created_at DESC LIMIT 6`,
  )
  const [pendingVerifications] = await pool.query(
    `SELECT sv.id, sv.verification_type, sv.business_name, sv.submitted_at,
            u.full_name, u.email FROM seller_verifications sv
     JOIN users u ON u.id = sv.user_id WHERE sv.status = 'pending'
     ORDER BY sv.submitted_at ASC LIMIT 5`,
  )
  const [recentReports] = await pool.query(
    `SELECT r.id, r.category, r.status, r.created_at, a.title AS advertisement_title
     FROM reports r LEFT JOIN advertisements a ON a.id = r.advertisement_id
     ORDER BY r.created_at DESC LIMIT 5`,
  )
  const [recentAudit] = await pool.query(
    `SELECT l.id, l.action, l.entity_type, l.entity_id, l.created_at, u.full_name AS administrator_name
     FROM admin_audit_logs l LEFT JOIN users u ON u.id = l.administrator_id
     ORDER BY l.created_at DESC, l.id DESC LIMIT 8`,
  )
  const sellers = Number(sellerRows[0].sellers || 0)
  const totalUsers = Number(userRows[0].total_users || 0)
  return {
    stats: {
      totalUsers,
      buyers: Math.max(0, totalUsers - sellers - Number(userRows[0].administrators || 0)),
      sellers,
      totalAdvertisements: Number(adRows[0].total_ads || 0),
      approvedAdvertisements: Number(adRows[0].approved_ads || 0),
      pendingAdvertisements: Number(adRows[0].pending_ads || 0),
      rejectedAdvertisements: Number(adRows[0].rejected_ads || 0),
      suspendedAdvertisements: Number(adRows[0].suspended_ads || 0),
      verifiedBusinesses: Number(verificationRows[0].total || 0),
      totalReports: Number(reportRows[0].total_reports || 0),
      openReports: Number(reportRows[0].open_reports || 0),
      revenue: Number(paymentRows[0].revenue || 0),
      successfulPayments: Number(paymentRows[0].successful_payments || 0),
    },
    recentUsers,
    recentAdvertisements: recentAds,
    pendingVerifications,
    recentReports,
    recentAudit,
  }
}

async function getAnalytics() {
  const [registrations] = await pool.query(
    `SELECT DATE_FORMAT(created_at, '%Y-%m') AS period, COUNT(*) AS total
     FROM users GROUP BY period ORDER BY period DESC LIMIT 24`,
  )
  const [adGrowth] = await pool.query(
    `SELECT DATE_FORMAT(created_at, '%Y-%m') AS period, COUNT(*) AS total
     FROM advertisements GROUP BY period ORDER BY period DESC LIMIT 24`,
  )
  const [approvals] = await pool.query(
    `SELECT DATE_FORMAT(approved_at, '%Y-%m') AS period, COUNT(*) AS total
     FROM advertisements WHERE approved_at IS NOT NULL
     GROUP BY period ORDER BY period DESC LIMIT 24`,
  )
  const [revenue] = await pool.query(
    `SELECT DATE_FORMAT(verified_at, '%Y-%m') AS period, SUM(amount) AS total
     FROM payment_transactions
     WHERE status = 'succeeded' AND verified_at IS NOT NULL
     GROUP BY period ORDER BY period DESC LIMIT 24`,
  )
  const [categories] = await pool.query(
    `SELECT c.name, COUNT(a.id) AS total
     FROM categories c LEFT JOIN advertisements a ON a.category_id = c.id
     GROUP BY c.id, c.name ORDER BY total DESC, c.name`,
  )
  const [activity] = await pool.query(
    `SELECT DATE_FORMAT(created_at, '%Y-%m') AS period, COUNT(*) AS total
     FROM messages GROUP BY period ORDER BY period DESC LIMIT 24`,
  )
  const latestPeriod = (rows) => rows.slice().reverse()
  return {
    registrations: latestPeriod(registrations).map((row) => ({ period: row.period, total: Number(row.total) })),
    advertisementGrowth: latestPeriod(adGrowth).map((row) => ({ period: row.period, total: Number(row.total) })),
    approvals: latestPeriod(approvals).map((row) => ({ period: row.period, total: Number(row.total) })),
    revenue: latestPeriod(revenue).map((row) => ({ period: row.period, total: Number(row.total) })),
    categories: categories.map((row) => ({ name: row.name, total: Number(row.total) })),
    activity: latestPeriod(activity).map((row) => ({ period: row.period, total: Number(row.total) })),
    notes: {
      approvals: 'Historical approval trends are available only for advertisements approved after approval timestamps were introduced.',
      revenue: 'Revenue includes only transactions verified as successful by a payment provider.',
    },
  }
}

async function listAds({ q, status, page, limit, sort }) {
  const where = []
  const values = []
  if (status) { where.push('a.status = ?'); values.push(status) }
  if (q) {
    where.push('(a.title LIKE ? OR u.full_name LIKE ? OR u.email LIKE ? OR c.name LIKE ?)')
    values.push(...Array(4).fill(`%${q}%`))
  }
  const order = {
    newest: 'a.created_at DESC',
    oldest: 'a.created_at ASC',
    price_asc: 'a.price ASC',
    price_desc: 'a.price DESC',
    views: 'a.views DESC',
  }[sort] || 'a.created_at DESC'
  const condition = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const offset = (page - 1) * limit
  const [rows] = await pool.execute(
    `SELECT a.id, a.title, a.slug, a.price, a.state, a.city, a.status, a.views,
            a.is_featured, a.moderation_note, a.created_at, a.approved_at,
            u.id AS seller_id, u.full_name AS seller_name, u.email AS seller_email,
            u.account_status AS seller_status, c.name AS category_name
     FROM advertisements a JOIN users u ON u.id = a.user_id
     JOIN categories c ON c.id = a.category_id
     ${condition} ORDER BY ${order} LIMIT ? OFFSET ?`,
    [...values, limit, offset],
  )
  const [count] = await pool.execute(
    `SELECT COUNT(*) AS total FROM advertisements a JOIN users u ON u.id = a.user_id
     JOIN categories c ON c.id = a.category_id ${condition}`,
    values,
  )
  if (!rows.length) return { advertisements: [], total: Number(count[0].total) }
  const ids = rows.map((row) => row.id)
  const placeholders = ids.map(() => '?').join(', ')
  const [images] = await pool.execute(
    `SELECT advertisement_id, image_url FROM product_images WHERE advertisement_id IN (${placeholders}) ORDER BY id`,
    ids,
  )
  const imageMap = new Map(rows.map((row) => [String(row.id), []]))
  for (const image of images) imageMap.get(String(image.advertisement_id))?.push(image.image_url)
  return {
    advertisements: rows.map((row) => ({ ...row, images: imageMap.get(String(row.id)) || [] })),
    total: Number(count[0].total),
  }
}

async function findAd(id) {
  const [rows] = await pool.execute(
    `SELECT a.*, u.full_name AS seller_name, u.email AS seller_email, c.name AS category_name
     FROM advertisements a JOIN users u ON u.id = a.user_id
     JOIN categories c ON c.id = a.category_id WHERE a.id = ?`,
    [id],
  )
  return rows[0] || null
}

async function updateAdFields({ id, fields, administratorId, reqMeta }) {
  const allowedFields = {
    title: 'title',
    description: 'description',
    price: 'price',
    categoryId: 'category_id',
    state: 'state',
    city: 'city',
  }
  const assignments = []
  const values = []
  for (const [field, column] of Object.entries(allowedFields)) {
    if (fields[field] !== undefined) {
      assignments.push(`${column} = ?`)
      values.push(fields[field])
    }
  }
  if (!assignments.length) return false
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const [existing] = await connection.execute('SELECT * FROM advertisements WHERE id = ? FOR UPDATE', [id])
    if (!existing.length) { await connection.rollback(); return null }
    const previous = existing[0]
    await connection.execute(`UPDATE advertisements SET ${assignments.join(', ')} WHERE id = ?`, [...values, id])
    if (fields.price !== undefined) {
      await discoveryModel.recordPriceChange(connection, {
        id,
        title: fields.title || previous.title,
        oldPrice: previous.price,
        newPrice: fields.price,
      })
    }
    const [imageRows] = await connection.execute(
      'SELECT image_url FROM product_images WHERE advertisement_id = ? ORDER BY id LIMIT 1',
      [id],
    )
    await connection.execute(
      `UPDATE favourites SET
         saved_title = COALESCE(?, saved_title),
         saved_price = COALESCE(?, saved_price),
         saved_state = COALESCE(?, saved_state),
         saved_city = COALESCE(?, saved_city),
         saved_image = COALESCE(?, saved_image),
         saved_category_id = COALESCE(?, saved_category_id)
       WHERE advertisement_id = ?`,
      [fields.title ?? null, fields.price ?? null, fields.state ?? null,
        fields.city ?? null, imageRows[0]?.image_url || null, fields.categoryId ?? null, id],
    )
    const newValue = { ...previous }
    for (const [field, column] of Object.entries(allowedFields)) {
      if (fields[field] !== undefined) newValue[column] = fields[field]
    }
    await connection.execute(
      `INSERT INTO admin_audit_logs
       (administrator_id, action, entity_type, entity_id, previous_value, new_value, ip_address, user_agent)
       VALUES (?, 'edit', 'advertisement', ?, ?, ?, ?, ?)`,
      [administratorId, id, json(previous), json(newValue),
        reqMeta.ipAddress || null, reqMeta.userAgent?.slice(0, 500) || null],
    )
    await connection.commit()
    return true
  } catch (error) { await connection.rollback(); throw error }
  finally { connection.release() }
}

async function moderateAd({ id, administratorId, action, status, reason, featured, reqMeta }) {
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const [rows] = await connection.execute(
      'SELECT user_id, status, is_featured, title FROM advertisements WHERE id = ? FOR UPDATE',
      [id],
    )
    if (!rows.length) { await connection.rollback(); return null }
    const ad = rows[0]
    const previous = { status: ad.status, is_featured: Boolean(ad.is_featured) }
    const nextStatus = status ?? ad.status
    const nextFeatured = featured ?? Boolean(ad.is_featured)
    await connection.execute(
      `UPDATE advertisements SET status = ?, is_featured = ?, moderation_note = ?,
       approved_at = CASE WHEN ? = 'approved' AND approved_at IS NULL THEN CURRENT_TIMESTAMP ELSE approved_at END
       WHERE id = ?`,
      [nextStatus, nextFeatured, reason ?? null, nextStatus, id],
    )
    if ((ad.status === 'approved') !== (nextStatus === 'approved')) {
      await discoveryModel.notifyAvailability(connection, { id, title: ad.title, status: nextStatus })
    }
    if (action !== 'feature') {
      const title = action === 'approve' ? 'Advertisement approved'
        : action === 'reject' ? 'Advertisement rejected'
          : action === 'request_changes' ? 'Changes requested for advertisement'
            : action === 'suspend' ? 'Advertisement suspended'
              : 'Advertisement reactivated'
      const body = reason || `${ad.title} status changed to ${nextStatus}.`
      await connection.execute(
        `INSERT INTO notifications (user_id, type, title, body, related_advertisement_id)
         VALUES (?, ?, ?, ?, ?)`,
        [ad.user_id, `advertisement_${action}`, title, body, id],
      )
    }
    await connection.execute(
      `INSERT INTO admin_audit_logs
       (administrator_id, action, entity_type, entity_id, previous_value, new_value, ip_address, user_agent)
       VALUES (?, ?, 'advertisement', ?, ?, ?, ?, ?)`,
      [administratorId, action, id, json(previous), json({
        status: nextStatus, is_featured: nextFeatured, reason: reason || null,
      }), reqMeta.ipAddress || null, reqMeta.userAgent?.slice(0, 500) || null],
    )
    await connection.commit()
    return { previous, newValue: { status: nextStatus, is_featured: nextFeatured }, sellerId: ad.user_id }
  } catch (error) {
    await connection.rollback()
    throw error
  } finally { connection.release() }
}

async function deleteAd(id, administratorId, reqMeta) {
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const [rows] = await connection.execute(
      'SELECT id, title, status, user_id FROM advertisements WHERE id = ? FOR UPDATE',
      [id],
    )
    if (!rows.length) { await connection.rollback(); return false }
    await discoveryModel.notifyAvailability(connection, {
      id, title: rows[0].title, status: 'removed',
    })
    await connection.execute('DELETE FROM advertisements WHERE id = ?', [id])
    await connection.execute(
      `INSERT INTO admin_audit_logs
       (administrator_id, action, entity_type, entity_id, previous_value, new_value, ip_address, user_agent)
       VALUES (?, 'delete', 'advertisement', ?, ?, NULL, ?, ?)`,
      [administratorId, id, json(rows[0]), reqMeta.ipAddress || null, reqMeta.userAgent?.slice(0, 500) || null],
    )
    await connection.commit()
    return true
  } catch (error) { await connection.rollback(); throw error }
  finally { connection.release() }
}

async function listUsers({ q, role, status, verified, verificationStatus, sort = 'newest', page, limit }) {
  const where = []
  const values = []
  if (q) { where.push('(u.full_name LIKE ? OR u.email LIKE ? OR u.phone LIKE ?)'); values.push(...Array(3).fill(`%${q}%`)) }
  if (role) { where.push('u.role = ?'); values.push(role) }
  if (status) { where.push('u.account_status = ?'); values.push(status) }
  if (verified !== null && verified !== undefined) {
    where.push('u.is_verified = ?')
    values.push(verified ? 1 : 0)
  }
  if (verificationStatus === 'none') {
    where.push('NOT EXISTS (SELECT 1 FROM seller_verifications sv WHERE sv.user_id = u.id)')
  } else if (verificationStatus) {
    where.push(`(SELECT sv.status FROM seller_verifications sv WHERE sv.user_id = u.id
                  ORDER BY sv.id DESC LIMIT 1) = ?`)
    values.push(verificationStatus)
  }
  const condition = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const order = sort === 'oldest' ? 'u.created_at ASC, u.id ASC' : 'u.created_at DESC, u.id DESC'
  const offset = (page - 1) * limit
  const [rows] = await pool.execute(
    `SELECT u.id, u.full_name, u.email, u.phone, u.role, u.account_status,
            u.profile_image,
            (SELECT sv.status = 'verified' FROM seller_verifications sv
             WHERE sv.user_id = u.id ORDER BY sv.id DESC LIMIT 1) AS is_verified,
            u.created_at,
            (SELECT COUNT(*) FROM advertisements a WHERE a.user_id = u.id) AS advertisements,
            (SELECT sv.status FROM seller_verifications sv WHERE sv.user_id = u.id
             ORDER BY sv.id DESC LIMIT 1) AS verification_status
     FROM users u ${condition} ORDER BY ${order} LIMIT ? OFFSET ?`,
    [...values, limit, offset],
  )
  const [count] = await pool.execute(`SELECT COUNT(*) AS total FROM users u ${condition}`, values)
  return { users: rows, total: Number(count[0].total) }
}

async function getUser(id) {
  const [users] = await pool.execute(
    `SELECT id, full_name, email, phone, role, account_status, profile_image,
            (SELECT sv.status = 'verified' FROM seller_verifications sv
             WHERE sv.user_id = users.id ORDER BY sv.id DESC LIMIT 1) AS is_verified,
            created_at, updated_at
     FROM users WHERE id = ? LIMIT 1`,
    [id],
  )
  if (!users.length) return null
  const [advertisements] = await pool.execute(
    `SELECT id, title, status, price, views, created_at FROM advertisements
     WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`,
    [id],
  )
  const [activity] = await pool.execute(
    `SELECT action, entity_type, entity_id, created_at FROM admin_audit_logs
     WHERE entity_type = 'user' AND entity_id = ? ORDER BY created_at DESC LIMIT 20`,
    [id],
  )
  const [verification] = await pool.execute(
    `SELECT id, status, submitted_at, reviewed_at, rejection_reason, admin_notes
     FROM seller_verifications WHERE user_id = ?
     ORDER BY id DESC LIMIT 1`,
    [id],
  )
  return { user: users[0], advertisements, activity, verification: verification[0] || null }
}

async function setUserStatus({ id, administratorId, administratorRole, status, reqMeta }) {
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const [rows] = await connection.execute(
      'SELECT id, role, account_status FROM users WHERE id = ? FOR UPDATE',
      [id],
    )
    if (!rows.length) { await connection.rollback(); return { error: 'not_found' } }
    const user = rows[0]
    if (user.role !== 'user' && administratorRole !== 'super_admin') {
      await connection.rollback()
      return { error: 'forbidden' }
    }
    if (String(id) === String(administratorId)) {
      await connection.rollback()
      return { error: 'self' }
    }
    if (status === 'suspended' && user.role === 'super_admin') {
      const [active] = await connection.query(
        "SELECT COUNT(*) AS total FROM users WHERE role = 'super_admin' AND account_status = 'active'",
      )
      if (Number(active[0].total) <= 1) {
        await connection.rollback()
        return { error: 'last_super_admin' }
      }
    }
    await connection.execute('UPDATE users SET account_status = ? WHERE id = ?', [status, id])
    await connection.execute(
      `INSERT INTO admin_audit_logs
       (administrator_id, action, entity_type, entity_id, previous_value, new_value, ip_address, user_agent)
       VALUES (?, ?, 'user', ?, ?, ?, ?, ?)`,
      [administratorId, status === 'suspended' ? 'suspend' : 'activate', id,
        json({ account_status: user.account_status }), json({ account_status: status }),
        reqMeta.ipAddress || null, reqMeta.userAgent?.slice(0, 500) || null],
    )
    await connection.commit()
    return { previous: user.account_status, status }
  } catch (error) { await connection.rollback(); throw error }
  finally { connection.release() }
}

async function setUserRole({ id, role, administratorId, administratorRole, reqMeta }) {
  if (administratorRole !== 'super_admin') return { error: 'forbidden' }
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const [rows] = await connection.execute(
      'SELECT id, role, account_status FROM users WHERE id = ? FOR UPDATE',
      [id],
    )
    if (!rows.length) { await connection.rollback(); return { error: 'not_found' } }
    const user = rows[0]
    if (String(id) === String(administratorId)) {
      await connection.rollback()
      return { error: 'self' }
    }
    if (user.role === 'super_admin' && role !== 'super_admin' && user.account_status === 'active') {
      const [active] = await connection.query(
        "SELECT COUNT(*) AS total FROM users WHERE role = 'super_admin' AND account_status = 'active'",
      )
      if (Number(active[0].total) <= 1) {
        await connection.rollback()
        return { error: 'last_super_admin' }
      }
    }
    await connection.execute('UPDATE users SET role = ? WHERE id = ?', [role, id])
    await connection.execute(
      `INSERT INTO admin_audit_logs
       (administrator_id, action, entity_type, entity_id, previous_value, new_value, ip_address, user_agent)
       VALUES (?, 'change_role', 'user', ?, ?, ?, ?, ?)`,
      [administratorId, id, json({ role: user.role }), json({ role }),
        reqMeta.ipAddress || null, reqMeta.userAgent?.slice(0, 500) || null],
    )
    await connection.commit()
    return { previous: user.role, role }
  } catch (error) { await connection.rollback(); throw error }
  finally { connection.release() }
}

async function listSellers({ q, page, limit }) {
  const search = q ? `AND (COALESCE(sp.business_name, u.full_name) LIKE ? OR u.email LIKE ? OR u.phone LIKE ?)` : ''
  const searchValues = q ? Array(3).fill(`%${q}%`) : []
  const [rows] = await pool.execute(
    `SELECT u.id AS user_id, u.full_name, u.email, u.phone, u.account_status, u.is_verified,
            sp.business_name, sp.slug, sp.logo_url, sp.address, sp.city, sp.state, sp.whatsapp,
            COUNT(DISTINCT a.id) AS advertisements
     FROM users u
     LEFT JOIN seller_profiles sp ON sp.user_id = u.id
     LEFT JOIN advertisements a ON a.user_id = u.id
     WHERE (sp.id IS NOT NULL OR a.id IS NOT NULL) ${search}
     GROUP BY u.id ORDER BY u.created_at DESC LIMIT ? OFFSET ?`,
    [...searchValues, limit, (page - 1) * limit],
  )
  const [count] = await pool.execute(
    `SELECT COUNT(*) AS total FROM users u LEFT JOIN seller_profiles sp ON sp.user_id = u.id
     LEFT JOIN advertisements a ON a.user_id = u.id
     WHERE (sp.id IS NOT NULL OR a.id IS NOT NULL) ${search}`,
    searchValues,
  )
  return { sellers: rows, total: Number(count[0].total) }
}

async function listCategories() {
  const [rows] = await pool.query(
    `SELECT c.*, p.category_id AS parent_id, parent.name AS parent_name,
            COUNT(DISTINCT a.id) AS advertisement_count
     FROM categories c
     LEFT JOIN category_subcategories p ON p.subcategory_id = c.id
     LEFT JOIN categories parent ON parent.id = p.category_id
     LEFT JOIN advertisements a ON a.category_id = c.id
     GROUP BY c.id ORDER BY c.display_order, c.name`,
  )
  return rows
}

async function saveCategory({ id, name, slug, description, image, isActive, displayOrder, parentId, administratorId, reqMeta }) {
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    let previous = null
    if (id) {
      const [existing] = await connection.execute('SELECT * FROM categories WHERE id = ? FOR UPDATE', [id])
      if (!existing.length) { await connection.rollback(); return null }
      previous = existing[0]
      await connection.execute(
        `UPDATE categories SET name = ?, slug = ?, description = ?, image = ?,
         is_active = ?, display_order = ? WHERE id = ?`,
        [name, slug, description || null, image || null, isActive, displayOrder, id],
      )
    } else {
      const [result] = await connection.execute(
        `INSERT INTO categories (name, slug, description, image, is_active, display_order)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [name, slug, description || null, image || null, isActive, displayOrder],
      )
      id = result.insertId
    }
    await connection.execute('DELETE FROM category_subcategories WHERE subcategory_id = ?', [id])
    if (parentId) {
      if (String(parentId) === String(id)) { await connection.rollback(); return { error: 'self_parent' } }
      const [parent] = await connection.execute('SELECT id FROM categories WHERE id = ? AND is_active = TRUE', [parentId])
      if (!parent.length) { await connection.rollback(); return { error: 'invalid_parent' } }
      await connection.execute(
        'INSERT INTO category_subcategories (category_id, subcategory_id) VALUES (?, ?)',
        [parentId, id],
      )
    }
    await connection.execute(
      `INSERT INTO admin_audit_logs
       (administrator_id, action, entity_type, entity_id, previous_value, new_value, ip_address, user_agent)
       VALUES (?, ?, 'category', ?, ?, ?, ?, ?)`,
      [administratorId, previous ? 'update' : 'create', id, json(previous),
        json({ name, slug, is_active: isActive, display_order: displayOrder, parentId }),
        reqMeta.ipAddress || null, reqMeta.userAgent?.slice(0, 500) || null],
    )
    await connection.commit()
    return id
  } catch (error) { await connection.rollback(); throw error }
  finally { connection.release() }
}

async function deleteCategory(id, administratorId, reqMeta) {
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const [rows] = await connection.execute('SELECT * FROM categories WHERE id = ? FOR UPDATE', [id])
    if (!rows.length) { await connection.rollback(); return false }
    const [ads] = await connection.execute('SELECT COUNT(*) AS total FROM advertisements WHERE category_id = ?', [id])
    const [children] = await connection.execute('SELECT COUNT(*) AS total FROM category_subcategories WHERE category_id = ?', [id])
    if (Number(ads[0].total) || Number(children[0].total)) {
      await connection.rollback()
      return 'in_use'
    }
    await connection.execute('DELETE FROM categories WHERE id = ?', [id])
    await connection.execute(
      `INSERT INTO admin_audit_logs
       (administrator_id, action, entity_type, entity_id, previous_value, ip_address, user_agent)
       VALUES (?, 'delete', 'category', ?, ?, ?, ?)`,
      [administratorId, id, json(rows[0]), reqMeta.ipAddress || null, reqMeta.userAgent?.slice(0, 500) || null],
    )
    await connection.commit()
    return true
  } catch (error) { await connection.rollback(); throw error }
  finally { connection.release() }
}

async function listReports({ status, category, q, page, limit }) {
  const where = []
  const values = []
  if (status) { where.push('r.status = ?'); values.push(status) }
  if (category) { where.push('r.category = ?'); values.push(category) }
  if (q) {
    where.push('(r.description LIKE ? OR a.title LIKE ? OR reporter.full_name LIKE ?)')
    values.push(...Array(3).fill(`%${q}%`))
  }
  const condition = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const [rows] = await pool.execute(
    `SELECT r.id, r.category, r.description, r.status, r.admin_notes, r.created_at,
            r.advertisement_id, r.seller_id, r.conversation_id, r.message_id,
            a.title AS advertisement_title,
            reporter.id AS reporter_id, reporter.full_name AS reporter_name,
            seller.full_name AS seller_name
     FROM reports r LEFT JOIN advertisements a ON a.id = r.advertisement_id
     JOIN users reporter ON reporter.id = r.reporter_id
     LEFT JOIN users seller ON seller.id = r.seller_id
     ${condition} ORDER BY r.created_at DESC LIMIT ? OFFSET ?`,
    [...values, limit, (page - 1) * limit],
  )
  const [count] = await pool.execute(
    `SELECT COUNT(*) AS total FROM reports r
     LEFT JOIN advertisements a ON a.id = r.advertisement_id
     JOIN users reporter ON reporter.id = r.reporter_id ${condition}`,
    values,
  )
  return { reports: rows, total: Number(count[0].total) }
}

async function resolveReport({ id, administratorId, status, notes, reqMeta }) {
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const [rows] = await connection.execute('SELECT * FROM reports WHERE id = ? FOR UPDATE', [id])
    if (!rows.length) { await connection.rollback(); return null }
    const old = rows[0]
    await connection.execute(
      `UPDATE reports SET status = ?, admin_notes = ?, reviewed_by = ?,
       reviewed_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [status, notes || null, administratorId, id],
    )
    await connection.execute(
      `INSERT INTO admin_audit_logs
       (administrator_id, action, entity_type, entity_id, previous_value, new_value, ip_address, user_agent)
       VALUES (?, ?, 'report', ?, ?, ?, ?, ?)`,
      [administratorId, status, id, json({ status: old.status }), json({ status, notes: notes || null }),
        reqMeta.ipAddress || null, reqMeta.userAgent?.slice(0, 500) || null],
    )
    await connection.commit()
    return old
  } catch (error) { await connection.rollback(); throw error }
  finally { connection.release() }
}

async function createReport({
  reporterId, advertisementId, sellerId, conversationId, messageId, category, description,
}) {
  const [recent] = await pool.execute(
    `SELECT id FROM reports WHERE reporter_id = ? AND category = ?
     AND ((advertisement_id <=> ?) AND (seller_id <=> ?)
       AND (conversation_id <=> ?) AND (message_id <=> ?))
     AND created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR) LIMIT 1`,
    [reporterId, category, advertisementId || null, sellerId || null,
      conversationId || null, messageId || null],
  )
  if (recent.length) return null
  const [count] = await pool.execute(
    'SELECT COUNT(*) AS total FROM reports WHERE reporter_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 1 DAY)',
    [reporterId],
  )
  if (Number(count[0].total) >= 5) return 'rate_limited'
  const [result] = await pool.execute(
    `INSERT INTO reports
       (reporter_id, advertisement_id, seller_id, conversation_id, message_id, category, description)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [reporterId, advertisementId || null, sellerId || null,
      conversationId || null, messageId || null, category, description],
  )
  return result.insertId
}

async function getReport(id) {
  const [rows] = await pool.execute(
    `SELECT id, reporter_id, advertisement_id, seller_id, conversation_id, message_id,
            category, description, status, admin_notes
     FROM reports WHERE id = ? LIMIT 1`,
    [id],
  )
  return rows[0] || null
}

async function listPayments({ status, page, limit }) {
  const where = status ? 'WHERE p.status = ?' : ''
  const values = status ? [status] : []
  const [rows] = await pool.execute(
    `SELECT p.id, p.user_id, u.full_name, u.email, p.advertisement_id, a.title AS advertisement_title,
            p.payment_type, p.amount, p.currency, p.status, p.provider, p.provider_reference,
            p.verified_at, p.created_at
     FROM payment_transactions p JOIN users u ON u.id = p.user_id
     LEFT JOIN advertisements a ON a.id = p.advertisement_id
     ${where} ORDER BY p.created_at DESC LIMIT ? OFFSET ?`,
    [...values, limit, (page - 1) * limit],
  )
  const [count] = await pool.execute(`SELECT COUNT(*) AS total FROM payment_transactions p ${where}`, values)
  const [revenue] = await pool.query(
    `SELECT COALESCE(SUM(amount), 0) AS total FROM payment_transactions
     WHERE status = 'succeeded' AND verified_at IS NOT NULL`,
  )
  return { payments: rows, total: Number(count[0].total), verifiedRevenue: Number(revenue[0].total || 0) }
}

async function listAuditLogs({ q, page, limit }) {
  const where = q ? 'WHERE l.action LIKE ? OR l.entity_type LIKE ? OR u.full_name LIKE ?' : ''
  const values = q ? Array(3).fill(`%${q}%`) : []
  const [rows] = await pool.execute(
    `SELECT l.id, l.administrator_id, u.full_name AS administrator_name, l.action,
            l.entity_type, l.entity_id, l.previous_value, l.new_value,
            l.ip_address, l.user_agent, l.created_at
     FROM admin_audit_logs l LEFT JOIN users u ON u.id = l.administrator_id
     ${where} ORDER BY l.created_at DESC, l.id DESC LIMIT ? OFFSET ?`,
    [...values, limit, (page - 1) * limit],
  )
  const [count] = await pool.execute(
    `SELECT COUNT(*) AS total FROM admin_audit_logs l
     LEFT JOIN users u ON u.id = l.administrator_id ${where}`,
    values,
  )
  return { logs: rows, total: Number(count[0].total) }
}

async function listAdmins() {
  const [rows] = await pool.query(
    `SELECT id, full_name, email, role, account_status, created_at
     FROM users WHERE role IN ('admin', 'super_admin') ORDER BY role DESC, full_name`,
  )
  return rows
}

module.exports = {
  createReport, deleteAd, deleteCategory, findAd, getAnalytics, getDashboard, getReport, getUser,
  listAds, listAuditLogs, listCategories, listPayments, listReports, listSellers, listUsers, listAdmins,
  moderateAd, resolveReport, saveCategory, setUserRole, setUserStatus, updateAdFields, writeAudit,
}
