const express = require('express')
const { body, param, query } = require('express-validator')
const adController = require('../controllers/adController')
const authenticate = require('../middleware/authMiddleware')
const { asyncHandler } = require('../middleware/errorMiddleware')
const { productImageUpload } = require('../middleware/productImageUpload')

const router = express.Router()
const discoveryController = require('../controllers/discoveryController')
const optionalAuthenticate = authenticate.optional

const adFields = [
  body('categoryId').notEmpty().withMessage('Category is required.'),
  body('title').trim().isLength({ min: 3, max: 180 }).withMessage('Title must be between 3 and 180 characters.'),
  body('brand').optional({ values: 'falsy' }).trim().isLength({ max: 120 }).withMessage('Brand must be 120 characters or less.'),
  body('specifications').optional({ values: 'falsy' }).trim().isLength({ max: 10000 }).withMessage('Specifications must be 10000 characters or less.'),
  body('description').trim().isLength({ min: 10, max: 10000 }).withMessage('Description must be between 10 and 10000 characters.'),
  body('price').isFloat({ min: 0, max: 99999999999.99 }).withMessage('Enter a valid non-negative price.'),
  body('conditionType').isIn(['new', 'used']).withMessage('Condition must be new or used.'),
  body('state').trim().isLength({ min: 2, max: 100 }).withMessage('Enter a valid state.'),
  body('city').trim().isLength({ min: 1, max: 120 }).withMessage('Enter a valid city.'),
  body('phone').trim().isLength({ min: 5, max: 32 }).withMessage('Enter a valid phone number.'),
  body('whatsapp').optional({ values: 'falsy' }).trim().isLength({ max: 32 }).withMessage('WhatsApp number is too long.'),
]

const searchFields = [
  query('q').optional().trim().isLength({ max: 180 }).withMessage('Search query must be 180 characters or less.'),
  query('category').optional().trim().matches(/^(?:[a-z0-9-]{1,140}|\d{1,20})$/i).withMessage('Choose a valid category.'),
  query('state').optional().trim().isLength({ min: 2, max: 100 }).withMessage('Choose a valid state.'),
  query('city').optional().trim().isLength({ min: 1, max: 120 }).withMessage('City must be 120 characters or less.'),
  query('minPrice').optional({ values: 'falsy' }).isFloat({ min: 0 }).withMessage('Minimum price must be non-negative.'),
  query('maxPrice').optional({ values: 'falsy' }).isFloat({ min: 0 }).withMessage('Maximum price must be non-negative.'),
  query('condition').optional({ values: 'falsy' }).isIn(['new', 'used']).withMessage('Condition must be new or used.'),
  query('verified').optional({ values: 'falsy' }).isIn(['true', 'false']).withMessage('Verified must be true or false.'),
  query('featured').optional({ values: 'falsy' }).isIn(['true', 'false', '1', '0']).withMessage('Featured must be true or false.'),
  query('recently').optional({ values: 'falsy' }).isIn(['true', 'false']).withMessage('Recently must be true or false.'),
  query('sort').optional({ values: 'falsy' }).isIn(['newest', 'oldest', 'price_asc', 'price_desc', 'most_viewed', 'popular']).withMessage('Choose a valid sort order.'),
  query('page').optional({ values: 'falsy' }).isInt({ min: 1, max: 1000000 }).withMessage('Page must be a positive integer.'),
  query('limit').optional({ values: 'falsy' }).isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1 and 50.'),
  query('maxPrice').custom((value, { req }) => {
    if (value !== undefined && value !== '' && req.query.minPrice !== undefined && req.query.minPrice !== '' && Number(value) < Number(req.query.minPrice)) {
      throw new Error('Maximum price must be greater than or equal to minimum price.')
    }
    return true
  }),
]

router.get('/search/suggestions', query('q').optional().trim().isLength({ max: 100 }), asyncHandler(adController.suggestions))
router.get('/search', ...searchFields, asyncHandler(adController.list))
router.get('/locations/popular', asyncHandler(adController.popularLocations))
router.get('/locations/cities', query('state').trim().isLength({ min: 2, max: 100 }), asyncHandler(adController.cities))
router.get('/sellers/:id', param('id').isInt({ min: 1 }), asyncHandler(adController.getSeller))
router.get('/:id/price-history', param('id').isInt({ min: 1 }), asyncHandler(discoveryController.priceHistory))
router.get('/', ...searchFields, asyncHandler(adController.list))
router.get('/:id', optionalAuthenticate, param('id').isInt({ min: 1 }), asyncHandler(adController.getById))
router.post('/', authenticate, productImageUpload, ...adFields, asyncHandler(adController.create))
router.put('/:id', authenticate, productImageUpload, param('id').isInt({ min: 1 }), ...adFields, asyncHandler(adController.update))
router.delete('/:id', authenticate, param('id').isInt({ min: 1 }), asyncHandler(adController.remove))

module.exports = router
