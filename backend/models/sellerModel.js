const { pool } = require('../config/database')

async function getDashboard(userId) {
  const [statsRows] = await pool.execute(
    `SELECT COUNT(*) AS total_ads,
            SUM(status = 'approved') AS active_ads,
            SUM(status = 'pending') AS pending_ads,
            SUM(status = 'rejected') AS rejected_ads,
            SUM(status = 'paused') AS paused_ads,
            COALESCE(SUM(views), 0) AS total_views
     FROM advertisements WHERE user_id = ?`,
    [userId],
  )
  const [enquiryRows] = await pool.execute(
    `SELECT COUNT(*) AS total
     FROM messages m
     JOIN advertisements a ON a.id = m.advertisement_id
     WHERE a.user_id = ? AND m.receiver_id = ?`,
    [userId, userId],
  )
  const [recentEnquiries] = await pool.execute(
    `SELECT m.id, m.message, m.created_at, m.advertisement_id,
            a.title AS advertisement_title, u.full_name AS sender_name
     FROM messages m
     JOIN advertisements a ON a.id = m.advertisement_id AND a.user_id = ?
     JOIN users u ON u.id = m.sender_id
     WHERE m.receiver_id = ?
     ORDER BY m.created_at DESC LIMIT 5`,
    [userId, userId],
  )
  const [topAds] = await pool.execute(
    `SELECT id, title, status, views, price, created_at
     FROM advertisements WHERE user_id = ?
     ORDER BY views DESC, created_at DESC LIMIT 5`,
    [userId],
  )
  const row = statsRows[0]
  return {
    stats: {
      totalAdvertisements: Number(row.total_ads || 0),
      activeAdvertisements: Number(row.active_ads || 0),
      pendingAdvertisements: Number(row.pending_ads || 0),
      rejectedAdvertisements: Number(row.rejected_ads || 0),
      pausedAdvertisements: Number(row.paused_ads || 0),
      totalProductViews: Number(row.total_views || 0),
      totalEnquiries: Number(enquiryRows[0].total || 0),
    },
    recentEnquiries,
    topAdvertisements: topAds,
  }
}

async function getPublicProfile(slug) {
  const [rows] = await pool.execute(
    `SELECT sp.business_name, sp.slug, sp.logo_url, sp.description, sp.email, sp.phone,
            sp.whatsapp, sp.website_url, sp.address, sp.state, sp.city, sp.years_in_business,
            sp.operating_hours, sp.category_id, c.name AS category_name,
            u.id AS seller_id, u.full_name AS seller_name, u.profile_image,
            (SELECT sv.status = 'verified' FROM seller_verifications sv
             WHERE sv.user_id = u.id ORDER BY sv.id DESC LIMIT 1) AS is_verified,
            u.created_at AS member_since
     FROM seller_profiles sp
     JOIN users u ON u.id = sp.user_id
     LEFT JOIN categories c ON c.id = sp.category_id
     WHERE sp.slug = ? LIMIT 1`,
    [slug],
  )
  return rows[0] || null
}

async function getPublicProfileByUserId(userId) {
  const [rows] = await pool.execute(
    'SELECT slug, business_name FROM seller_profiles WHERE user_id = ? LIMIT 1',
    [userId],
  )
  return rows[0] || null
}

async function submitVerification(userId, verification) {
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const [owners] = await connection.execute('SELECT id FROM users WHERE id = ? FOR UPDATE', [userId])
    if (!owners.length) {
      await connection.rollback()
      return null
    }
    const [existing] = await connection.execute(
      `SELECT id, status FROM seller_verifications
       WHERE user_id = ? AND status IN ('pending', 'information_requested')
       ORDER BY submitted_at DESC, id DESC LIMIT 1 FOR UPDATE`,
      [userId],
    )
    if (existing[0]?.status === 'pending') {
      await connection.rollback()
      return null
    }

    let verificationId
    if (existing[0]?.status === 'information_requested') {
      verificationId = existing[0].id
      await connection.execute(
        `UPDATE seller_verifications SET
           verification_type = ?, business_name = ?, registration_number = ?,
           business_address = ?, business_phone = ?, business_owner = ?, business_email = ?,
           whatsapp = ?, state = ?, city = ?, business_description = ?, website = ?,
           business_category_id = ?, cac_document_path = COALESCE(?, cac_document_path),
           identity_document_path = COALESCE(?, identity_document_path),
           additional_document_path = COALESCE(?, additional_document_path),
           document_path = COALESCE(?, document_path),
           status = 'pending', rejection_reason = NULL, reviewed_by = NULL,
           reviewed_at = NULL, submitted_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          verification.type, verification.businessName, verification.registrationNumber,
          verification.address, verification.phone, verification.businessOwner, verification.email,
          verification.whatsapp, verification.state, verification.city, verification.description,
          verification.website, verification.categoryId,
          verification.documents.cacDocument || null,
          verification.documents.identityDocument || null,
          verification.documents.additionalDocument || null,
          verification.documents.document || verification.documents.identityDocument || null,
          verificationId,
        ],
      )
    } else {
      const [result] = await connection.execute(
        `INSERT INTO seller_verifications
           (user_id, verification_type, business_name, registration_number,
            business_address, business_phone, business_owner, business_email, whatsapp,
            state, city, business_description, website, business_category_id,
            cac_document_path, identity_document_path, additional_document_path, document_path)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          userId, verification.type, verification.businessName, verification.registrationNumber,
          verification.address, verification.phone, verification.businessOwner, verification.email,
          verification.whatsapp, verification.state, verification.city, verification.description,
          verification.website, verification.categoryId,
          verification.documents.cacDocument || null,
          verification.documents.identityDocument || verification.documents.document || null,
          verification.documents.additionalDocument || null,
          verification.documents.document || verification.documents.identityDocument || Object.values(verification.documents)[0],
        ],
      )
      verificationId = result.insertId
    }
    await connection.execute(
      `INSERT INTO notifications (user_id, type, title, body)
       VALUES (?, 'verification_submitted', 'Verification application submitted', ?)`,
      [userId, 'Your business verification application is awaiting review.'],
    )
    await connection.commit()
    return verificationId
  } catch (error) {
    await connection.rollback()
    throw error
  } finally { connection.release() }
}

async function getVerification(userId) {
  const [rows] = await pool.execute(
    `SELECT id, verification_type, business_name, registration_number, business_address,
            business_phone, business_owner, business_email, whatsapp, state, city,
            business_description, website, business_category_id, status, admin_notes,
            rejection_reason, reviewed_by, submitted_at, reviewed_at, updated_at,
            (cac_document_path IS NOT NULL) AS has_cac_document,
            (identity_document_path IS NOT NULL OR document_path IS NOT NULL) AS has_identity_document,
            (additional_document_path IS NOT NULL) AS has_additional_document
     FROM seller_verifications WHERE user_id = ?
     ORDER BY submitted_at DESC, id DESC LIMIT 1`,
    [userId],
  )
  return rows[0] || null
}

async function updateVerificationDocuments(userId, documents) {
  const [rows] = await pool.execute(
    `SELECT id, status FROM seller_verifications
     WHERE user_id = ? ORDER BY submitted_at DESC, id DESC LIMIT 1`,
    [userId],
  )
  const verification = rows[0]
  if (!verification || verification.status !== 'information_requested') return false
  await pool.execute(
    `UPDATE seller_verifications SET
       cac_document_path = COALESCE(?, cac_document_path),
       identity_document_path = COALESCE(?, identity_document_path),
       additional_document_path = COALESCE(?, additional_document_path),
       document_path = COALESCE(?, document_path),
       status = 'pending', rejection_reason = NULL, reviewed_by = NULL,
       reviewed_at = NULL, submitted_at = CURRENT_TIMESTAMP
     WHERE id = ? AND user_id = ? AND status = 'information_requested'`,
    [
      documents.cacDocument || null,
      documents.identityDocument || documents.document || null,
      documents.additionalDocument || null,
      documents.document || documents.identityDocument || Object.values(documents)[0],
      verification.id,
      userId,
    ],
  )
  await pool.execute(
    `INSERT INTO notifications (user_id, type, title, body)
     VALUES (?, 'verification_resubmitted', 'Verification information resubmitted', ?)`,
    [userId, 'Your requested verification information has been submitted for review.'],
  )
  return getVerification(userId)
}

async function getAnalytics(userId, fromDate, toDate, advertisementId) {
  const adFilter = advertisementId ? 'AND a.id = ?' : ''
  const params = advertisementId
    ? [userId, fromDate, toDate, advertisementId]
    : [userId, fromDate, toDate]
  const [viewRows] = await pool.execute(
    `SELECT DATE_FORMAT(aa.occurred_at, '%Y-%m-%d') AS day, COUNT(*) AS total
     FROM advertisement_analytics aa
     JOIN advertisements a ON a.id = aa.advertisement_id
     WHERE a.user_id = ? AND aa.occurred_at >= ? AND aa.occurred_at < DATE_ADD(?, INTERVAL 1 DAY)
       ${adFilter}
     GROUP BY DATE_FORMAT(aa.occurred_at, '%Y-%m-%d') ORDER BY day`,
    params,
  )
  const [enquiryRows] = await pool.execute(
    `SELECT DATE_FORMAT(m.created_at, '%Y-%m-%d') AS day, COUNT(*) AS total
     FROM messages m
     JOIN advertisements a ON a.id = m.advertisement_id
     WHERE a.user_id = ? AND m.receiver_id = ?
       AND m.created_at >= ? AND m.created_at < DATE_ADD(?, INTERVAL 1 DAY)
       ${advertisementId ? 'AND a.id = ?' : ''}
     GROUP BY DATE_FORMAT(m.created_at, '%Y-%m-%d') ORDER BY day`,
    advertisementId
      ? [userId, userId, fromDate, toDate, advertisementId]
      : [userId, userId, fromDate, toDate],
  )
  const [totalRows] = await pool.execute(
    `SELECT COUNT(*) AS total_ads,
            COALESCE(SUM(a.status = 'approved'), 0) AS active_ads,
            COALESCE(SUM(a.status = 'pending'), 0) AS pending_ads,
            COALESCE(SUM(a.status = 'rejected'), 0) AS rejected_ads,
            COALESCE(SUM(a.views), 0) AS total_views
     FROM advertisements a WHERE a.user_id = ? ${advertisementId ? 'AND a.id = ?' : ''}`,
    advertisementId ? [userId, advertisementId] : [userId],
  )
  const [enquiryTotals] = await pool.execute(
    `SELECT COUNT(*) AS total
     FROM messages m
     JOIN advertisements a ON a.id = m.advertisement_id
     WHERE a.user_id = ? AND m.receiver_id = ? ${advertisementId ? 'AND a.id = ?' : ''}`,
    advertisementId ? [userId, userId, advertisementId] : [userId, userId],
  )
  const [favoriteTotals] = await pool.execute(
    `SELECT COUNT(*) AS total
     FROM favourites f
     JOIN advertisements a ON a.id = f.advertisement_id
     WHERE a.user_id = ? ${advertisementId ? 'AND a.id = ?' : ''}`,
    advertisementId ? [userId, advertisementId] : [userId],
  )
  const [statusRows] = await pool.execute(
    `SELECT a.status, COUNT(*) AS total
     FROM advertisements a
     WHERE a.user_id = ? ${advertisementId ? 'AND a.id = ?' : ''}
     GROUP BY a.status ORDER BY a.status`,
    advertisementId ? [userId, advertisementId] : [userId],
  )
  const [topAds] = await pool.execute(
    `SELECT a.id, a.title, a.status, a.views, a.price, a.created_at,
            c.name AS category_name, a.state, a.city,
            (SELECT COUNT(*) FROM messages m
             WHERE m.advertisement_id = a.id AND m.receiver_id = ?) AS enquiries,
            (SELECT COUNT(*) FROM favourites f
             WHERE f.advertisement_id = a.id) AS favourites
     FROM advertisements a
     JOIN categories c ON c.id = a.category_id
     WHERE a.user_id = ? ${advertisementId ? 'AND a.id = ?' : ''}
     ORDER BY a.views DESC, enquiries DESC, a.created_at DESC LIMIT 10`,
    advertisementId ? [userId, userId, advertisementId] : [userId, userId],
  )
  return {
    trackedViews: viewRows.map((row) => ({ date: row.day, views: Number(row.total) })),
    enquiries: enquiryRows.map((row) => ({ date: row.day, enquiries: Number(row.total) })),
    totalAdvertisements: Number(totalRows[0].total_ads || 0),
    activeAdvertisements: Number(totalRows[0].active_ads || 0),
    pendingAdvertisements: Number(totalRows[0].pending_ads || 0),
    rejectedAdvertisements: Number(totalRows[0].rejected_ads || 0),
    totalViews: Number(totalRows[0].total_views || 0),
    totalEnquiries: Number(enquiryTotals[0].total || 0),
    totalFavourites: Number(favoriteTotals[0].total || 0),
    statusDistribution: statusRows.map((row) => ({
      status: row.status,
      count: Number(row.total),
    })),
    topAdvertisements: topAds.map((row) => ({
      ...row,
      views: Number(row.views),
      enquiries: Number(row.enquiries),
      favourites: Number(row.favourites),
    })),
    historyNote: 'Daily view history starts when tracking was enabled. Total views include the existing advertisement counters.',
  }
}

async function createNotification({ userId, type, title, body, advertisementId = null }) {
  await pool.execute(
    `INSERT INTO notifications (user_id, type, title, body, related_advertisement_id)
     VALUES (?, ?, ?, ?, ?)`,
    [userId, type, title, body, advertisementId],
  )
}

async function listNotifications(userId) {
  const [rows] = await pool.execute(
    `SELECT id, type, title, body, related_advertisement_id, is_read, created_at
     FROM notifications WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 100`,
    [userId],
  )
  return rows
}

async function markNotificationRead(userId, id) {
  const [result] = await pool.execute(
    'UPDATE notifications SET is_read = TRUE WHERE user_id = ? AND id = ?',
    [userId, id],
  )
  return result.affectedRows > 0
}

async function listPendingVerifications() {
  const result = await listVerifications({ status: 'pending', page: 1, limit: 50 })
  return result.verifications
}

async function getVerificationDocument(id, document = 'identity') {
  const columns = {
    cac: 'cac_document_path',
    identity: 'identity_document_path',
    additional: 'additional_document_path',
  }
  const column = columns[document]
  if (!column) return null
  const [rows] = await pool.execute(
    `SELECT COALESCE(${column}, ${document === 'identity' ? 'document_path' : column}) AS document_path
     FROM seller_verifications WHERE id = ? LIMIT 1`,
    [id],
  )
  return rows[0]?.document_path || null
}

async function getVerificationDetail(id) {
  const [rows] = await pool.execute(
    `SELECT sv.id, sv.user_id, sv.verification_type, sv.business_name, sv.registration_number,
            sv.business_address, sv.business_phone, sv.business_owner, sv.business_email,
            sv.whatsapp, sv.state, sv.city, sv.business_description, sv.website,
            sv.business_category_id, c.name AS business_category, sv.status, sv.admin_notes,
            sv.rejection_reason, sv.reviewed_by, sv.submitted_at, sv.reviewed_at,
            u.full_name AS owner_name, u.email AS owner_email, u.phone AS owner_phone,
            u.profile_image,
            (sv.cac_document_path IS NOT NULL) AS has_cac_document,
            (sv.identity_document_path IS NOT NULL OR sv.document_path IS NOT NULL) AS has_identity_document,
            (sv.additional_document_path IS NOT NULL) AS has_additional_document,
            sp.logo_url AS business_logo
     FROM seller_verifications sv
     JOIN users u ON u.id = sv.user_id
     LEFT JOIN categories c ON c.id = sv.business_category_id
     LEFT JOIN seller_profiles sp ON sp.user_id = sv.user_id
     WHERE sv.id = ? LIMIT 1`,
    [id],
  )
  return rows[0] || null
}

async function reviewVerification(id, reviewerId, status, notes, reqMeta = {}, transactionConnection = null) {
  const ownsConnection = !transactionConnection
  const connection = transactionConnection || await pool.getConnection()
  try {
    if (ownsConnection) await connection.beginTransaction()
    const [rows] = await connection.execute(
      `SELECT user_id, business_name, status FROM seller_verifications
       WHERE id = ? AND status = 'pending' FOR UPDATE`,
      [id],
    )
    if (!rows.length) {
      if (ownsConnection) await connection.rollback()
      return null
    }
    const verification = rows[0]
    await connection.execute(
      `UPDATE seller_verifications SET status = ?, admin_notes = ?, rejection_reason = ?, reviewed_by = ?,
       reviewed_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [status, notes || null, status === 'rejected' ? notes || null : null, reviewerId, id],
    )
    await connection.execute(
      'UPDATE users SET is_verified = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [status === 'verified', verification.user_id],
    )
    await connection.execute(
      `INSERT INTO notifications (user_id, type, title, body)
       VALUES (?, ?, ?, ?)`,
      [
        verification.user_id,
        `verification_${status}`,
        status === 'verified' ? 'Seller verification approved' : 'Seller verification update',
        status === 'verified'
          ? 'Your seller verification has been approved.'
          : `Your seller verification was rejected${notes ? `: ${notes.slice(0, 420)}` : '.'}`,
      ],
    )
    await connection.execute(
      `INSERT INTO admin_audit_logs
       (administrator_id, action, entity_type, entity_id, previous_value, new_value, ip_address, user_agent)
       VALUES (?, ?, 'verification', ?, ?, ?, ?, ?)`,
      [reviewerId, status, id, JSON.stringify({ status: verification.status }),
        JSON.stringify({ status, notes: notes || null }), reqMeta.ipAddress || null,
        reqMeta.userAgent?.slice(0, 500) || null],
    )
    if (ownsConnection) await connection.commit()
    return verification.user_id
  } catch (error) {
    if (ownsConnection) await connection.rollback()
    throw error
  } finally {
    if (ownsConnection) connection.release()
  }
}

async function listVerifications({ status, q = '', page, limit }) {
  const where = status ? 'WHERE sv.status = ?' : ''
  const values = status ? [status] : []
  const conditions = status ? [where.slice(6)] : []
  if (q) {
    conditions.push('(sv.business_name LIKE ? OR u.full_name LIKE ? OR u.email LIKE ? OR sv.business_phone LIKE ?)')
    values.push(...Array(4).fill(`%${q}%`))
  }
  const condition = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const [rows] = await pool.execute(
    `SELECT sv.id, sv.user_id, sv.verification_type, sv.business_name, sv.registration_number,
            sv.business_address, sv.business_phone, sv.business_owner, sv.business_email,
            sv.whatsapp, sv.state, sv.city, sv.status, sv.admin_notes, sv.rejection_reason,
            sv.submitted_at, sv.reviewed_at, u.full_name, u.email, u.profile_image,
            (sv.cac_document_path IS NOT NULL) AS has_cac_document,
            (sv.identity_document_path IS NOT NULL OR sv.document_path IS NOT NULL) AS has_identity_document,
            (sv.additional_document_path IS NOT NULL) AS has_additional_document,
            sp.logo_url AS business_logo
     FROM seller_verifications sv JOIN users u ON u.id = sv.user_id
     LEFT JOIN seller_profiles sp ON sp.user_id = sv.user_id
     ${condition} ORDER BY sv.submitted_at DESC LIMIT ? OFFSET ?`,
    [...values, limit, (page - 1) * limit],
  )
  const [count] = await pool.execute(
    `SELECT COUNT(*) AS total FROM seller_verifications sv
     JOIN users u ON u.id = sv.user_id ${condition}`,
    values,
  )
  const [stats] = await pool.query(
    `SELECT COUNT(*) AS total,
            SUM(status IN ('pending', 'information_requested')) AS pending,
            SUM(status = 'verified') AS verified,
            SUM(status = 'rejected') AS rejected,
            SUM(status = 'information_requested') AS information_requested
     FROM seller_verifications`,
  )
  return {
    verifications: rows,
    total: Number(count[0].total),
    stats: {
      total: Number(stats[0].total || 0),
      pending: Number(stats[0].pending || 0),
      verified: Number(stats[0].verified || 0),
      rejected: Number(stats[0].rejected || 0),
      informationRequested: Number(stats[0].information_requested || 0),
    },
  }
}

async function requestVerificationInfo(id, administratorId, notes, reqMeta = {}) {
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const [rows] = await connection.execute(
      `SELECT user_id, status FROM seller_verifications
       WHERE id = ? AND status IN ('pending', 'information_requested') FOR UPDATE`,
      [id],
    )
    if (!rows.length) { await connection.rollback(); return false }
    const verification = rows[0]
    await connection.execute(
      `UPDATE seller_verifications SET status = 'information_requested', admin_notes = ?,
       rejection_reason = NULL, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP,
       updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [notes, administratorId, id],
    )
    await connection.execute(
      `INSERT INTO notifications (user_id, type, title, body)
       VALUES (?, 'verification_info_requested', 'Additional verification information requested', ?)`,
      [verification.user_id, notes.slice(0, 450)],
    )
    await connection.execute(
      `INSERT INTO admin_audit_logs
       (administrator_id, action, entity_type, entity_id, previous_value, new_value, ip_address, user_agent)
       VALUES (?, 'request_info', 'verification', ?, ?, ?, ?, ?)`,
      [administratorId, id, JSON.stringify({ status: verification.status }),
        JSON.stringify({ status: verification.status, notes }), reqMeta.ipAddress || null,
        reqMeta.userAgent?.slice(0, 500) || null],
    )
    await connection.commit()
    return true
  } catch (error) { await connection.rollback(); throw error }
  finally { connection.release() }
}

async function revokeVerification(id, administratorId, reason, reqMeta = {}) {
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const [rows] = await connection.execute(
      `SELECT user_id, status FROM seller_verifications WHERE id = ? FOR UPDATE`,
      [id],
    )
    if (!rows.length) { await connection.rollback(); return false }
    const verification = rows[0]
    if (verification.status !== 'verified') { await connection.rollback(); return 'not_verified' }
    await connection.execute(
      `UPDATE seller_verifications SET status = 'revoked', admin_notes = ?,
       reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [reason, administratorId, id],
    )
    await connection.execute(
      'UPDATE users SET is_verified = FALSE, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [verification.user_id],
    )
    await connection.execute(
      `INSERT INTO notifications (user_id, type, title, body)
       VALUES (?, 'verification_revoked', 'Business verification revoked', ?)`,
      [verification.user_id, `Your business verification has been revoked: ${reason.slice(0, 400)}`],
    )
    await connection.execute(
      `INSERT INTO admin_audit_logs
       (administrator_id, action, entity_type, entity_id, previous_value, new_value, ip_address, user_agent)
       VALUES (?, 'revoke', 'verification', ?, ?, ?, ?, ?)`,
      [administratorId, id, JSON.stringify({ status: verification.status }),
        JSON.stringify({ status: 'revoked', reason }), reqMeta.ipAddress || null,
        reqMeta.userAgent?.slice(0, 500) || null],
    )
    await connection.commit()
    return true
  } catch (error) { await connection.rollback(); throw error }
  finally { connection.release() }
}

async function getAdvertisementOwner(advertisementId) {
  const [rows] = await pool.execute(
    'SELECT user_id, title FROM advertisements WHERE id = ? LIMIT 1',
    [advertisementId],
  )
  return rows[0] || null
}

module.exports = {
  createNotification,
  getAdvertisementOwner,
  getAnalytics,
  getDashboard,
  getPublicProfile,
  getPublicProfileByUserId,
  getVerification,
  getVerificationDocument,
  getVerificationDetail,
  listNotifications,
  listPendingVerifications,
  listVerifications,
  markNotificationRead,
  reviewVerification,
  requestVerificationInfo,
  revokeVerification,
  submitVerification,
  updateVerificationDocuments,
}
