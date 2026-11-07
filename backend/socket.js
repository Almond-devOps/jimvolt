const jwt = require('jsonwebtoken')
const { Server } = require('socket.io')
const userModel = require('./models/userModel')
const messageModel = require('./models/messageModel')
const { tokenVersionMatches } = require('./utils/tokenVersion')

function createSocketServer(httpServer, allowedOrigins) {
  const io = new Server(httpServer, {
    cors: { origin: allowedOrigins, methods: ['GET', 'POST'] },
    maxHttpBufferSize: 1e6,
  })
  const onlineCounts = new Map()

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token
      if (typeof token !== 'string' || !token) return next(new Error('Authentication required.'))
      const payload = jwt.verify(token, process.env.JWT_SECRET)
      const user = await userModel.findById(payload.sub)
      if (!user || user.account_status !== 'active') return next(new Error('Account unavailable.'))
      if (!tokenVersionMatches(payload.tokenVersion, user.token_version)) {
        return next(new Error('Invalid or expired authentication token.'))
      }
      socket.data.userId = String(user.id)
      next()
    } catch {
      next(new Error('Invalid or expired authentication token.'))
    }
  })

  io.on('connection', (socket) => {
    const userId = socket.data.userId
    const currentCount = onlineCounts.get(userId) || 0
    onlineCounts.set(userId, currentCount + 1)
    socket.join(`user:${userId}`)

    socket.on('conversation:join', (conversationId, acknowledge) => {
      void (async () => {
        const id = String(conversationId || '')
        if (!/^\d+$/.test(id) || !(await messageModel.isParticipant(id, userId))) {
          if (typeof acknowledge === 'function') acknowledge({ ok: false, message: 'Conversation access denied.' })
          return
        }
        const room = `conversation:${id}`
        socket.join(room)
        const delivered = await messageModel.markConversationDelivered(id, userId)
        if (delivered) io.to(room).emit('message:delivered', { conversationId: id, userId })
        const conversation = await messageModel.getConversation(id, userId)
        const otherUserId = String(conversation.other_user.id)
        if (typeof acknowledge === 'function') {
          acknowledge({
            ok: true,
            presence: {
              [userId]: true,
              [otherUserId]: (onlineCounts.get(otherUserId) || 0) > 0,
            },
          })
        }
      })().catch((error) => {
        console.error('Socket conversation join failed:', error.message)
        if (typeof acknowledge === 'function') acknowledge({ ok: false, message: 'Could not join this conversation.' })
      })
    })

    socket.on('conversation:leave', (conversationId) => {
      const id = String(conversationId || '')
      if (!/^\d+$/.test(id) || !socket.rooms.has(`conversation:${id}`)) return
      socket.to(`conversation:${id}`).emit('typing:update', {
        conversationId: id,
        userId,
        isTyping: false,
      })
      socket.leave(`conversation:${id}`)
    })

    const handleTyping = (conversationId, isTyping) => {
      void (async () => {
        const now = Date.now()
        if (isTyping) {
          if (now - (socket.data.lastTypingAt || 0) < 250) return
          socket.data.lastTypingAt = now
        }
        const id = String(conversationId || '')
        if (!/^\d+$/.test(id) || !socket.rooms.has(`conversation:${id}`)) return
        if (!(await messageModel.isParticipant(id, userId))) return
        socket.to(`conversation:${id}`).emit('typing:update', {
          conversationId: id,
          userId,
          isTyping,
        })
      })().catch((error) => console.error('Socket typing update failed:', error.message))
    }
    socket.on('typing:start', (conversationId) => handleTyping(conversationId, true))
    socket.on('typing:stop', (conversationId) => handleTyping(conversationId, false))

    socket.on('disconnect', () => {
      void (async () => {
        const remaining = Math.max(0, (onlineCounts.get(userId) || 1) - 1)
        if (remaining) {
          onlineCounts.set(userId, remaining)
          return
        }
        onlineCounts.delete(userId)
        const peers = await messageModel.peerIdsForUser(userId)
        for (const peerId of peers) {
          io.to(`user:${peerId}`).emit('presence:update', { userId, online: false })
        }
      })().catch((error) => console.error('Socket disconnect cleanup failed:', error.message))
    })

    void (async () => {
      const peers = await messageModel.peerIdsForUser(userId)
      if (!socket.connected) return
      socket.emit('presence:initial', peers
        .filter((peerId) => (onlineCounts.get(String(peerId)) || 0) > 0)
        .map((peerId) => String(peerId)))
      if (currentCount === 0) {
        for (const peerId of peers) {
          io.to(`user:${peerId}`).emit('presence:update', { userId, online: true })
        }
      }
    })().catch((error) => {
      console.error('Socket presence setup failed:', error.message)
      socket.disconnect(true)
    })
  })

  return io
}

module.exports = { createSocketServer }
