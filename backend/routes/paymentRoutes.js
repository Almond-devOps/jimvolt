const express = require('express')
const { rateLimit } = require('express-rate-limit')
const { body, param } = require('express-validator')
const promotionController = require('../controllers/promotionController')
const authenticate = require('../middleware/authMiddleware')
const { asyncHandler } = require('../middleware/errorMiddleware')

const router = express.Router()
const initializeLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { message: 'Too many checkout attempts. Please try again later.' },
})
const eventLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
})
const referenceParam = param('reference').matches(/^[a-f0-9-]{36}$/i)

router.get('/packages', asyncHandler(promotionController.packages))
router.get('/featured', asyncHandler(promotionController.featured))
router.post('/webhook', asyncHandler(promotionController.webhook))
router.post(
  '/track/:id',
  eventLimit,
  param('id').isInt({ min: 1 }),
  body('event').isIn(['impression', 'click']),
  asyncHandler(promotionController.track),
)

router.use(authenticate)
router.get('/my-promotions', asyncHandler(promotionController.myPromotions))
router.post(
  '/initialize',
  initializeLimit,
  body('advertisementId').isInt({ min: 1 }).withMessage('Choose an eligible advertisement.'),
  body('packageId').isInt({ min: 1 }).withMessage('Choose an available promotion package.'),
  asyncHandler(promotionController.initialize),
)
router.get('/verify/:reference', referenceParam, asyncHandler(promotionController.verify))

module.exports = router