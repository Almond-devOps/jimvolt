const express = require('express')
const { rateLimit } = require('express-rate-limit')
const { body, param, query } = require('express-validator')
const authenticate = require('../middleware/authMiddleware')
const { asyncHandler } = require('../middleware/errorMiddleware')
const messageController = require('../controllers/messageController')

const router = express.Router()
const messageRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { message: 'You are sending messages too quickly. Please try again shortly.' },
})
const reportRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { message: 'Too many conversation reports. Please try again later.' },
})
const conversationId = param('id').isInt({ min: 1 })

router.use(authenticate)

router.get('/', asyncHandler(messageController.list))
router.post(
  '/',
  messageRateLimit,
  body('advertisementId').isInt({ min: 1 }).withMessage('Select a valid advertisement.'),
  body('message').trim().isLength({ min: 2, max: 2000 })
    .withMessage('Message must be between 2 and 2000 characters.'),
  asyncHandler(messageController.create),
)

router.get('/conversations', query('q').optional().trim().isLength({ max: 100 }), asyncHandler(messageController.listConversations))
router.post(
  '/conversations',
  body('advertisementId').isInt({ min: 1 }).withMessage('Select a valid advertisement.'),
  asyncHandler(messageController.createConversation),
)
router.post('/uploads', (req, res) => res.status(410).json({
  message: 'Image attachments are no longer supported. Send a text message instead.',
}))
router.get('/conversations/:id', conversationId, asyncHandler(messageController.getConversation))
router.get(
  '/conversations/:id/messages',
  conversationId,
  query('beforeId').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 50 }),
  asyncHandler(messageController.listMessages),
)
router.post(
  '/conversations/:id/messages',
  messageRateLimit,
  conversationId,
  body('message').isString().withMessage('Write a text message.').bail().trim()
    .isLength({ min: 1, max: 2000 }).withMessage('Message must be between 1 and 2000 characters.'),
  asyncHandler(messageController.send),
)
router.put('/conversations/:id/read', conversationId, asyncHandler(messageController.markConversationRead))
router.put(
  '/conversations/:id/archive',
  conversationId,
  body('archived').isBoolean(),
  asyncHandler(messageController.setArchived),
)
router.delete('/conversations/:id', conversationId, asyncHandler(messageController.archive))
router.put('/:id/read', param('id').isInt({ min: 1 }), asyncHandler(messageController.markMessageRead))
router.post(
  '/conversations/:id/report',
  reportRateLimit,
  conversationId,
  body('messageId').optional({ values: 'falsy' }).isInt({ min: 1 }),
  body('description').trim().isLength({ min: 10, max: 2000 }),
  asyncHandler(messageController.reportConversation),
)

module.exports = router
