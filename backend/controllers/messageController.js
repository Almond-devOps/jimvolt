const crypto = require('node:crypto')
const { validationResult } = require('express-validator')
const adModel = require('../models/adModel')
const messageModel = require('../models/messageModel')
const { detectImageType } = require('../utils/detectImageType')
const { isValidMessageAttachment } = require('../utils/messageAttachment')

function checkValidation(req) {
  const validation = validationResult(req)
  if (!validation.isEmpty()) {
    const error = new Error(validation.array()[0].msg)
    error.statusCode = 400
    throw error
  }
}

function invalid(message, statusCode = 400) {
  const error = new Error(message)
  error.statusCode = statusCode
  return error
}

function cloudinaryConfig() {
  const { CLOUDINARY_CLOUD_NAME: cloudName, CLOUDINARY_API_KEY: apiKey, CLOUDINARY_API_SECRET: apiSecret } = process.env
  if (!cloudName || !apiKey || !apiSecret) {
    throw invalid('Image messaging is not configured on this server.', 503)
  }
  return { cloudName, apiKey, apiSecret }
}

async function uploadImages(req, res) {
  const config = cloudinaryConfig()
  if (!req.files?.length) throw invalid('Select at least one image to upload.')
  const uploaded = []
  for (const file of req.files) {
    if (detectImageType(file.buffer) !== file.mimetype) {
      throw invalid('An image file has an invalid or unsupported file signature.')
    }

    const publicId = `user_${req.user.id}/${crypto.randomUUID()}`
    const timestamp = Math.floor(Date.now() / 1000)
    const folder = 'jimvolt/messages'
    const signedParams = `folder=${folder}&public_id=${publicId}&timestamp=${timestamp}`
    const signature = crypto.createHash('sha1')
      .update(`${signedParams}${config.apiSecret}`)
      .digest('hex')
    const formData = new FormData()
    formData.append('file', new Blob([file.buffer], { type: file.mimetype }), 'message-image')
    formData.append('api_key', config.apiKey)
    formData.append('timestamp', String(timestamp))
    formData.append('folder', folder)
    formData.append('public_id', publicId)
    formData.append('signature', signature)
    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${config.cloudName}/image/upload`,
      { method: 'POST', body: formData, signal: AbortSignal.timeout(30000) },
    )
    if (!response.ok) {
      const error = new Error('Image upload service could not accept the selected image.')
      error.statusCode = 502
      throw error
    }
    const result = await response.json()
    if (typeof result.secure_url !== 'string' || typeof result.public_id !== 'string') {
      const error = new Error('Image upload service returned an invalid response.')
      error.statusCode = 502
      throw error
    }
    uploaded.push({ url: result.secure_url, publicId: result.public_id })
  }
  return res.status(201).json({ attachments: uploaded })
}

async function list(req, res) {
  return res.json({ messages: await messageModel.findForUser(req.user.id) })
}

async function create(req, res) {
  checkValidation(req)
  const advertisement = await adModel.findPublicById(req.body.advertisementId)
  if (!advertisement) throw invalid('This advertisement is no longer available.', 404)
  if (String(advertisement.seller.id) === String(req.user.id)) {
    throw invalid('You cannot message yourself about your own advertisement.')
  }
  const conversationId = await messageModel.createOrGetConversation({
    buyerId: req.user.id,
    sellerId: advertisement.seller.id,
    advertisementId: advertisement.id,
  })
  const result = await messageModel.sendMessage({
    conversationId,
    senderId: req.user.id,
    message: req.body.message.trim(),
  })
  const io = req.app.get('io')
  if (io) {
    const connected = await io.in(`conversation:${conversationId}`).fetchSockets()
    if (connected.some((socket) => socket.data.userId === String(result.receiverId))) {
      await messageModel.markConversationDelivered(conversationId, result.receiverId)
      result.messages.forEach((item) => { item.delivered_at = new Date() })
    }
  }
  io?.to(`conversation:${conversationId}`).emit('message:new', {
    conversationId: String(conversationId),
    messages: result.messages,
  })
  io?.to(`user:${result.receiverId}`).emit('messages:unread_count', {
    count: await messageModel.unreadCount(result.receiverId),
  })
  return res.status(201).json({
    id: result.messages[0].id,
    conversationId,
    message: 'Your message has been sent to the seller.',
  })
}

async function createConversation(req, res) {
  checkValidation(req)
  const advertisement = await adModel.findPublicById(req.body.advertisementId)
  if (!advertisement) throw invalid('This advertisement is no longer available.', 404)
  if (String(advertisement.seller.id) === String(req.user.id)) {
    throw invalid('You cannot start a conversation with yourself.')
  }
  const id = await messageModel.createOrGetConversation({
    buyerId: req.user.id,
    sellerId: advertisement.seller.id,
    advertisementId: advertisement.id,
  })
  const conversation = await messageModel.getConversation(id, req.user.id)
  return res.status(200).json({ conversation })
}

async function listConversations(req, res) {
  checkValidation(req)
  const search = String(req.query.q || '').trim().slice(0, 100)
  return res.json({
    conversations: await messageModel.listConversations(req.user.id, search),
    unreadCount: await messageModel.unreadCount(req.user.id),
  })
}

async function getConversation(req, res) {
  checkValidation(req)
  const conversation = await messageModel.getConversation(req.params.id, req.user.id)
  if (!conversation) throw invalid('Conversation not found.', 404)
  return res.json({ conversation })
}

async function listMessages(req, res) {
  checkValidation(req)
  const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 30))
  const beforeId = req.query.beforeId ? Number(req.query.beforeId) : null
  const result = await messageModel.listMessages(req.params.id, req.user.id, { beforeId, limit })
  if (!result) throw invalid('Conversation not found.', 404)
  return res.json(result)
}

async function send(req, res) {
  checkValidation(req)
  const message = typeof req.body.message === 'string' ? req.body.message.trim() : ''
  const rawAttachments = Array.isArray(req.body.attachments) ? req.body.attachments : []
  if (!message && !rawAttachments.length) throw invalid('Write a message or attach an image.')
  if (message.length > 2000) throw invalid('Messages may not exceed 2000 characters.')
  if (rawAttachments.length > 4) throw invalid('You can attach up to four images per message.')
  const { cloudName } = rawAttachments.length ? cloudinaryConfig() : { cloudName: '' }
  if (rawAttachments.some((attachment) => !isValidMessageAttachment(attachment, req.user.id, cloudName))) {
    throw invalid('One or more image attachments are invalid.')
  }

  const result = await messageModel.sendMessage({
    conversationId: req.params.id,
    senderId: req.user.id,
    message,
    attachments: rawAttachments,
  })
  if (result === null) throw invalid('Conversation not found.', 404)
  if (result === false) throw invalid('You are not a participant in this conversation.', 403)

  const io = req.app.get('io')
  if (io) {
    const connected = await io.in(`conversation:${req.params.id}`).fetchSockets()
    if (connected.some((socket) => socket.data.userId === String(result.receiverId))) {
      await messageModel.markConversationDelivered(req.params.id, result.receiverId)
      result.messages.forEach((item) => { item.delivered_at = new Date() })
    }
  }
  io?.to(`conversation:${req.params.id}`).emit('message:new', {
    conversationId: String(req.params.id),
    messages: result.messages,
  })
  io?.to(`user:${result.receiverId}`).emit('messages:unread_count', {
    count: await messageModel.unreadCount(result.receiverId),
  })
  return res.status(201).json({ messages: result.messages })
}

async function markConversationRead(req, res) {
  checkValidation(req)
  const conversation = await messageModel.getConversation(req.params.id, req.user.id)
  if (!conversation) throw invalid('Conversation not found.', 404)
  await messageModel.markConversationRead(req.params.id, req.user.id)
  const io = req.app.get('io')
  io?.to(`conversation:${req.params.id}`).emit('message:read', {
    conversationId: String(req.params.id),
    userId: String(req.user.id),
  })
  io?.to(`user:${req.user.id}`).emit('messages:unread_count', {
    count: await messageModel.unreadCount(req.user.id),
  })
  return res.json({ message: 'Conversation marked as read.' })
}

async function markMessageRead(req, res) {
  checkValidation(req)
  const targetMessage = await messageModel.getMessageForUser(req.params.id, req.user.id)
  if (!targetMessage) throw invalid('Message not found.', 404)
  const marked = await messageModel.markMessageRead(req.params.id, req.user.id)
  if (!marked) throw invalid('Message not found.', 404)
  const io = req.app.get('io')
  io?.to(`conversation:${targetMessage.conversation_id}`).emit('message:read', {
    conversationId: String(targetMessage.conversation_id),
    userId: String(req.user.id),
    messageId: String(req.params.id),
  })
  io?.to(`user:${req.user.id}`).emit('messages:unread_count', {
    count: await messageModel.unreadCount(req.user.id),
  })
  return res.json({ message: 'Message marked as read.' })
}

async function archive(req, res) {
  checkValidation(req)
  const archived = await messageModel.setArchived(req.params.id, req.user.id, true)
  if (!archived) throw invalid('Conversation not found.', 404)
  req.app.get('io')?.to(`user:${req.user.id}`).emit('messages:unread_count', {
    count: await messageModel.unreadCount(req.user.id),
  })
  return res.status(204).end()
}

async function setArchived(req, res) {
  checkValidation(req)
  const archived = Boolean(req.body.archived)
  const updated = await messageModel.setArchived(req.params.id, req.user.id, archived)
  if (!updated) throw invalid('Conversation not found.', 404)
  req.app.get('io')?.to(`user:${req.user.id}`).emit('messages:unread_count', {
    count: await messageModel.unreadCount(req.user.id),
  })
  return res.json({ isArchived: archived })
}

async function reportConversation(req, res) {
  checkValidation(req)
  const conversation = await messageModel.getConversation(req.params.id, req.user.id)
  if (!conversation) throw invalid('Conversation not found.', 404)
  if (req.body.messageId && !(await messageModel.getMessageInConversation(
    req.body.messageId, conversation.id,
  ))) throw invalid('The reported message does not belong to this conversation.', 400)
  const reportId = await require('../models/adminModel').createReport({
    reporterId: req.user.id,
    conversationId: conversation.id,
    messageId: req.body.messageId || null,
    sellerId: String(conversation.buyer_id) === String(req.user.id)
      ? conversation.seller_id : conversation.buyer_id,
    category: 'message_abuse',
    description: req.body.description.trim(),
  })
  if (reportId === null) throw invalid('You have already submitted a similar report recently.', 409)
  if (reportId === 'rate_limited') throw invalid('You have reached the daily report limit.', 429)
  return res.status(201).json({ id: reportId, message: 'Conversation report submitted for review.' })
}

module.exports = {
  archive,
  create,
  createConversation,
  getConversation,
  list,
  listConversations,
  listMessages,
  markConversationRead,
  markMessageRead,
  reportConversation,
  send,
  setArchived,
  uploadImages,
}
