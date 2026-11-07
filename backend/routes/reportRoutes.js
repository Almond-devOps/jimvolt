const express = require('express')
const { body } = require('express-validator')
const authenticate = require('../middleware/authMiddleware')
const { asyncHandler } = require('../middleware/errorMiddleware')
const reportController = require('../controllers/reportController')

const router = express.Router()
router.use(authenticate)
router.post(
  '/',
  body('advertisementId').optional({ values: 'falsy' }).isInt({ min: 1 }),
  body('sellerId').optional({ values: 'falsy' }).isInt({ min: 1 }),
  body('category').isIn(['fraud', 'fake_seller', 'misleading_description', 'incorrect_price', 'duplicate', 'suspicious_activity', 'inappropriate_content', 'other']),
  body('description').trim().isLength({ min: 10, max: 2000 }),
  asyncHandler(reportController.create),
)

module.exports = router
