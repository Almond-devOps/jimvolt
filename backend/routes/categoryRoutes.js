const express = require('express')
const { param } = require('express-validator')
const categoryController = require('../controllers/categoryController')
const { asyncHandler } = require('../middleware/errorMiddleware')

const router = express.Router()

router.get('/', asyncHandler(categoryController.list))
router.get('/:id', param('id').trim().notEmpty(), asyncHandler(categoryController.getById))

module.exports = router
