const express = require('express')
const { body, param } = require('express-validator')
const userController = require('../controllers/userController')
const authenticate = require('../middleware/authMiddleware')
const { asyncHandler } = require('../middleware/errorMiddleware')

const router = express.Router()

router.get('/sellers', asyncHandler(userController.getVerifiedSellers))
router.use(authenticate)
router.get('/profile', asyncHandler(userController.getProfile))
router.get('/dashboard', asyncHandler(userController.getDashboard))
router.get('/my-ads', asyncHandler(userController.myAds))
router.get('/favourites', asyncHandler(userController.getFavorites))
router.post('/favourites/:id', param('id').isInt({ min: 1 }), asyncHandler(userController.addFavorite))
router.delete('/favourites/:id', param('id').isInt({ min: 1 }), asyncHandler(userController.removeFavorite))
router.put(
  '/profile',
  body('fullName').trim().isLength({ min: 2, max: 120 }).withMessage('Full name must be between 2 and 120 characters.'),
  body('phone').optional({ values: 'falsy' }).trim().isLength({ min: 8, max: 32 }).withMessage('Phone number is too long.'),
  body('profileImage')
    .optional({ values: 'falsy' })
    .isURL({ protocols: ['http', 'https'], require_protocol: true })
    .isLength({ max: 2048 })
    .withMessage('Profile image must be a valid HTTP or HTTPS URL.'),
  asyncHandler(userController.updateProfile),
)
router.put(
  '/settings',
  body('email').optional({ values: 'falsy' }).trim().isEmail().withMessage('Enter a valid email address.').isLength({ max: 254 }),
  body('currentPassword').optional({ values: 'falsy' }).isString().isLength({ max: 72 }),
  body('phone').optional({ values: 'falsy' }).trim().isLength({ min: 8, max: 32 }).withMessage('Phone number is too long.'),
  body('profileImage')
    .optional({ values: 'falsy' })
    .isURL({ protocols: ['http', 'https'], require_protocol: true })
    .isLength({ max: 2048 })
    .withMessage('Profile image must be a valid HTTP or HTTPS URL.'),
  asyncHandler(userController.updateSettings),
)
router.put(
  '/change-password',
  body('currentPassword').isString().isLength({ min: 1, max: 72 }).withMessage('Current password is required.'),
  body('newPassword').isString().isLength({ min: 8, max: 72 }).withMessage('Password must be at least 8 characters long.'),
  asyncHandler(userController.changePassword),
)

module.exports = router
