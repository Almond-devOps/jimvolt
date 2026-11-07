const { pool } = require('../config/database')

async function findForUser(userId) {
  const [rows] = await pool.execute(
    `SELECT m.id, m.conversation_id, m.sender_id, m.receiver_id, m.advertisement_id,
            COALESCE(m.message_content, m.message) AS message, m.message_type,
            m.attachment_url, m.is_read, m.created_at, a.title AS advertisement_title,
            sender.full_name AS sender_name, receiver.full_name AS receiver_name
     FROM messages m
     JOIN advertisements a ON a.id = m.advertisement_id
     JOIN users sender ON sender.id = m.sender_id
     JOIN users receiver ON receiver.id = m.receiver_id
     WHERE m.sender_id = ? OR m.receiver_id = ?
     ORDER BY m.created_at DESC LIMIT 200`,
    [userId, userId],
  )
  return rows
}

async function create({ senderId, receiverId, advertisementId, message }) {
  const [result] = await pool.execute(
    `INSERT INTO messages
       (sender_id, receiver_id, advertisement_id, message, message_content)
     VALUES (?, ?, ?, ?, ?)`,
    [senderId, receiverId, advertisementId, message, message],
  )
  return result.insertId
}

async function isParticipant(conversationId, userId) {
  const [rows] = await pool.execute(
    `SELECT 1 FROM conversation_participants
     WHERE conversation_id = ? AND user_id = ? LIMIT 1`,
    [conversationId, userId],
  )
  return rows.length > 0
}

async function createOrGetConversation({ buyerId, sellerId, advertisementId }) {
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    await connection.execute(
      `INSERT IGNORE INTO conversations (buyer_id, seller_id, advertisement_id)
       VALUES (?, ?, ?)`,
      [buyerId, sellerId, advertisementId],
    )
    const [rows] = await connection.execute(
      `SELECT id FROM conversations
       WHERE buyer_id = ? AND seller_id = ? AND advertisement_id = ?
       LIMIT 1 FOR UPDATE`,
      [buyerId, sellerId, advertisementId],
    )
    if (!rows.length) throw new Error('Conversation could not be created.')
    const conversationId = rows[0].id
    await connection.execute(
      `INSERT IGNORE INTO conversation_participants (conversation_id, user_id)
       VALUES (?, ?), (?, ?)`,
      [conversationId, buyerId, conversationId, sellerId],
    )
    await connection.commit()
    return conversationId
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}

async function listConversations(userId, search = '') {
  const searchClause = search
    ? `AND (other.full_name LIKE ? OR COALESCE(sp.business_name, '') LIKE ?
            OR a.title LIKE ? OR last_message.message_content LIKE ?)`
    : ''
  const searchValues = search ? Array(4).fill(`%${search}%`) : []
  const [rows] = await pool.execute(
    `SELECT c.id, c.buyer_id, c.seller_id, c.advertisement_id, c.updated_at,
            other.id AS other_user_id, other.full_name AS other_user_name,
            other.profile_image AS other_user_image, other.is_verified AS other_user_verified,
            sp.business_name AS other_business_name, a.title AS advertisement_title,
            a.price AS advertisement_price, a.slug AS advertisement_slug,
            (SELECT pi.image_url FROM product_images pi
             WHERE pi.advertisement_id = a.id ORDER BY pi.id LIMIT 1) AS advertisement_image,
            last_message.id AS last_message_id, last_message.message_type AS last_message_type,
            COALESCE(last_message.message_content, last_message.message) AS last_message_content,
            last_message.sender_id AS last_message_sender_id,
            last_message.created_at AS last_message_at,
            (SELECT COUNT(*) FROM messages unread
             WHERE unread.conversation_id = c.id AND unread.receiver_id = ?
               AND unread.sender_id <> ? AND unread.is_read = FALSE) AS unread_count,
            cp.is_archived
     FROM conversations c
     JOIN conversation_participants cp ON cp.conversation_id = c.id AND cp.user_id = ?
     JOIN users other ON other.id = IF(c.buyer_id = ?, c.seller_id, c.buyer_id)
     LEFT JOIN seller_profiles sp ON sp.user_id = other.id
     LEFT JOIN advertisements a ON a.id = c.advertisement_id
     LEFT JOIN messages last_message ON last_message.id = (
       SELECT m.id FROM messages m WHERE m.conversation_id = c.id
       ORDER BY m.created_at DESC, m.id DESC LIMIT 1
     )
     WHERE cp.is_archived = FALSE ${searchClause}
     ORDER BY COALESCE(last_message.created_at, c.updated_at) DESC, c.id DESC`,
    [userId, userId, userId, userId, ...searchValues],
  )
  return rows.map((row) => ({
    ...row,
    unread_count: Number(row.unread_count || 0),
    other_user_verified: Boolean(row.other_user_verified),
    advertisement: row.advertisement_id ? {
      id: row.advertisement_id,
      title: row.advertisement_title,
      price: row.advertisement_price,
      slug: row.advertisement_slug,
      image: row.advertisement_image,
    } : null,
    other_user: {
      id: row.other_user_id,
      name: row.other_business_name || row.other_user_name,
      profile_image: row.other_user_image,
      is_verified: Boolean(row.other_user_verified),
    },
    last_message: row.last_message_id ? {
      id: row.last_message_id,
      type: row.last_message_type,
      content: row.last_message_content,
      sender_id: row.last_message_sender_id,
      created_at: row.last_message_at,
    } : null,
  }))
}

async function getConversation(conversationId, userId) {
  const [rows] = await pool.execute(
    `SELECT c.id, c.buyer_id, c.seller_id, c.advertisement_id,
            other.id AS other_user_id, other.full_name AS other_user_name,
            other.profile_image AS other_user_image, other.is_verified AS other_user_verified,
            sp.business_name AS other_business_name, a.title AS advertisement_title,
            a.price AS advertisement_price, a.slug AS advertisement_slug,
            (SELECT pi.image_url FROM product_images pi
             WHERE pi.advertisement_id = a.id ORDER BY pi.id LIMIT 1) AS advertisement_image
     FROM conversations c
     JOIN conversation_participants cp ON cp.conversation_id = c.id AND cp.user_id = ?
     JOIN users other ON other.id = IF(c.buyer_id = ?, c.seller_id, c.buyer_id)
     LEFT JOIN seller_profiles sp ON sp.user_id = other.id
     LEFT JOIN advertisements a ON a.id = c.advertisement_id
     WHERE c.id = ? LIMIT 1`,
    [userId, userId, conversationId],
  )
  if (!rows.length) return null
  const row = rows[0]
  return {
    id: row.id,
    buyer_id: row.buyer_id,
    seller_id: row.seller_id,
    other_user: {
      id: row.other_user_id,
      name: row.other_business_name || row.other_user_name,
      profile_image: row.other_user_image,
      is_verified: Boolean(row.other_user_verified),
    },
    advertisement: row.advertisement_id ? {
      id: row.advertisement_id,
      title: row.advertisement_title,
      price: row.advertisement_price,
      slug: row.advertisement_slug,
      image: row.advertisement_image,
    } : null,
  }
}

async function listMessages(conversationId, userId, { beforeId, limit }) {
  if (!(await isParticipant(conversationId, userId))) return null
  const beforeClause = beforeId ? 'AND m.id < ?' : ''
  const params = beforeId ? [conversationId, beforeId, limit + 1] : [conversationId, limit + 1]
  const [rows] = await pool.execute(
    `SELECT m.id, m.conversation_id, m.sender_id, m.receiver_id, m.message_type,
            COALESCE(m.message_content, m.message) AS message_content,
            m.attachment_url, m.attachment_public_id, m.delivered_at, m.is_read, m.created_at
     FROM messages m WHERE m.conversation_id = ? ${beforeClause}
     ORDER BY m.created_at DESC, m.id DESC LIMIT ?`,
    params,
  )
  const hasMore = rows.length > limit
  return { messages: rows.slice(0, limit).reverse(), hasMore }
}

async function sendMessage({ conversationId, senderId, message, attachments = [] }) {
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const [conversationRows] = await connection.execute(
      `SELECT id, buyer_id, seller_id, advertisement_id
       FROM conversations WHERE id = ? FOR UPDATE`,
      [conversationId],
    )
    if (!conversationRows.length) {
      await connection.rollback()
      return null
    }
    const conversation = conversationRows[0]
    if (![String(conversation.buyer_id), String(conversation.seller_id)].includes(String(senderId))) {
      await connection.rollback()
      return false
    }
    const receiverId = String(senderId) === String(conversation.buyer_id)
      ? conversation.seller_id : conversation.buyer_id
    const inserted = []
    if (message) {
      const [result] = await connection.execute(
        `INSERT INTO messages
          (conversation_id, sender_id, receiver_id, advertisement_id, message, message_type, message_content)
         VALUES (?, ?, ?, ?, ?, 'text', ?)`,
        [conversationId, senderId, receiverId, conversation.advertisement_id, message, message],
      )
      inserted.push(result.insertId)
    }
    for (const attachment of attachments) {
      const [result] = await connection.execute(
        `INSERT INTO messages
          (conversation_id, sender_id, receiver_id, advertisement_id, message,
           message_type, message_content, attachment_url, attachment_public_id)
         VALUES (?, ?, ?, ?, ?, 'image', ?, ?, ?)`,
        [conversationId, senderId, receiverId, conversation.advertisement_id,
          attachment.url, attachment.url, attachment.url, attachment.publicId],
      )
      inserted.push(result.insertId)
    }
    if (!inserted.length) {
      await connection.rollback()
      return []
    }
    await connection.execute(
      `UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [conversationId],
    )
    await connection.execute(
      `UPDATE conversation_participants SET is_archived = FALSE
       WHERE conversation_id = ? AND user_id IN (?, ?)`,
      [conversationId, senderId, receiverId],
    )
    const [messages] = await connection.execute(
      `SELECT id, conversation_id, sender_id, receiver_id, message_type,
              COALESCE(message_content, message) AS message_content,
              attachment_url, attachment_public_id, delivered_at, is_read, created_at
       FROM messages WHERE id IN (${inserted.map(() => '?').join(', ')})
       ORDER BY created_at, id`,
      inserted,
    )
    await connection.execute(
      `INSERT INTO notifications (user_id, type, title, body, related_advertisement_id)
       VALUES (?, 'new_message', 'New message', ?, ?)`,
      [receiverId, message ? 'You received a new message.' : 'You received an image.',
        conversation.advertisement_id],
    )
    await connection.commit()
    return { messages, receiverId }
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}

async function markConversationRead(conversationId, userId) {
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const [participants] = await connection.execute(
      `SELECT 1 FROM conversation_participants
       WHERE conversation_id = ? AND user_id = ? FOR UPDATE`,
      [conversationId, userId],
    )
    if (!participants.length) {
      await connection.rollback()
      return false
    }
    await connection.execute(
      `UPDATE messages SET is_read = TRUE
       WHERE conversation_id = ? AND receiver_id = ? AND is_read = FALSE`,
      [conversationId, userId],
    )
    await connection.execute(
      `UPDATE conversation_participants SET last_read_at = CURRENT_TIMESTAMP
       WHERE conversation_id = ? AND user_id = ?`,
      [conversationId, userId],
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

async function markMessageRead(messageId, userId) {
  const [result] = await pool.execute(
    `UPDATE messages SET is_read = TRUE
     WHERE id = ? AND receiver_id = ? AND conversation_id IS NOT NULL`,
    [messageId, userId],
  )
  return result.affectedRows > 0
}

async function markConversationDelivered(conversationId, userId) {
  const [result] = await pool.execute(
    `UPDATE messages SET delivered_at = CURRENT_TIMESTAMP
     WHERE conversation_id = ? AND receiver_id = ? AND delivered_at IS NULL`,
    [conversationId, userId],
  )
  return result.affectedRows
}

async function getMessageForUser(messageId, userId) {
  const [rows] = await pool.execute(
    `SELECT id, conversation_id FROM messages
     WHERE id = ? AND (sender_id = ? OR receiver_id = ?) LIMIT 1`,
    [messageId, userId, userId],
  )
  return rows[0] || null
}

async function setArchived(conversationId, userId, archived) {
  const [result] = await pool.execute(
    `UPDATE conversation_participants SET is_archived = ?
     WHERE conversation_id = ? AND user_id = ?`,
    [archived, conversationId, userId],
  )
  return result.affectedRows > 0
}

async function unreadCount(userId) {
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS total FROM messages m
     JOIN conversation_participants cp
       ON cp.conversation_id = m.conversation_id AND cp.user_id = ? AND cp.is_archived = FALSE
     WHERE m.receiver_id = ? AND m.sender_id <> ? AND m.is_read = FALSE`,
    [userId, userId, userId],
  )
  return Number(rows[0].total || 0)
}

async function conversationIdsForUser(userId) {
  const [rows] = await pool.execute(
    `SELECT conversation_id FROM conversation_participants WHERE user_id = ?`,
    [userId],
  )
  return rows.map((row) => row.conversation_id)
}

async function peerIdsForUser(userId) {
  const [rows] = await pool.execute(
    `SELECT DISTINCT IF(c.buyer_id = ?, c.seller_id, c.buyer_id) AS user_id
     FROM conversations c JOIN conversation_participants cp
       ON cp.conversation_id = c.id AND cp.user_id = ?`,
    [userId, userId],
  )
  return rows.map((row) => row.user_id)
}

async function getReportedConversationMessages(conversationId, limit = 100) {
  const [rows] = await pool.execute(
    `SELECT id, sender_id, message_type, COALESCE(message_content, message) AS message_content,
            attachment_url, is_read, created_at
     FROM messages WHERE conversation_id = ?
     ORDER BY created_at DESC, id DESC LIMIT ?`,
    [conversationId, limit],
  )
  return rows.reverse()
}

async function getMessageInConversation(messageId, conversationId) {
  const [rows] = await pool.execute(
    'SELECT id FROM messages WHERE id = ? AND conversation_id = ? LIMIT 1',
    [messageId, conversationId],
  )
  return rows[0] || null
}

module.exports = {
  conversationIdsForUser,
  create,
  createOrGetConversation,
  findForUser,
  getMessageInConversation,
  getReportedConversationMessages,
  getMessageForUser,
  peerIdsForUser,
  getConversation,
  isParticipant,
  listConversations,
  listMessages,
  markConversationRead,
  markConversationDelivered,
  markMessageRead,
  setArchived,
  sendMessage,
  unreadCount,
}
