const express = require('express')
const { rateLimit } = require('../utils/rateLimit')
const { body, param, query } = require('express-validator')
const authenticate = require('../middleware/authMiddleware')
const { asyncHandler } = require('../middleware/errorMiddleware')
const discoveryController = require('../controllers/discoveryController')

const router = express.Router()
const writeLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { message: 'Too many wishlist or history updates. Please retry shortly.' },
})
const id = param('id').isInt({ min: 1 })
const paging = [
  query('page').optional().isInt({ min: 1, max: 1000000 }),
  query('limit').optional().isInt({ min: 1, max: 50 }),
]

router.use(authenticate)
router.get('/', ...paging,
  query('q').optional().trim().isLength({ max: 100 }),
  query('category').optional().isInt({ min: 1 }),
  query('sort').optional().isIn(['newest', 'price_asc', 'price_desc']),
  asyncHandler(discoveryController.listFavorites))
router.get('/count', asyncHandler(discoveryController.favoriteCount))
router.get('/preferences', asyncHandler(discoveryController.preferences))
router.put('/preferences', body('notifyPriceDrops').isBoolean(), asyncHandler(discoveryController.updatePreferences))
router.delete('/entry/:id', writeLimit, id, asyncHandler(discoveryController.removeFavoriteById))
router.post('/:id', writeLimit, id, asyncHandler(discoveryController.addFavorite))
router.delete('/:id', writeLimit, id, asyncHandler(discoveryController.removeFavorite))
router.delete('/', writeLimit, asyncHandler(discoveryController.clearFavorites))

const historyRouter = express.Router()
historyRouter.use(authenticate)
historyRouter.get('/', ...paging, asyncHandler(discoveryController.listRecentlyViewed))
historyRouter.post(
  '/import',
  writeLimit,
  body('advertisementIds').isArray({ min: 1, max: 50 }),
  body('advertisementIds.*').isInt({ min: 1 }),
  asyncHandler(discoveryController.importRecentlyViewed),
)
historyRouter.post('/:id', writeLimit, id, asyncHandler(discoveryController.trackView))
historyRouter.delete('/:id', writeLimit, id, asyncHandler(discoveryController.removeRecentlyViewed))
historyRouter.delete('/', writeLimit, asyncHandler(discoveryController.clearRecentlyViewed))

module.exports = { favorites: router, recentlyViewed: historyRouter }
