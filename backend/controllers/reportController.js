const { validationResult } = require('express-validator')
const adModel = require('../models/adModel')
const adminModel = require('../models/adminModel')
const userModel = require('../models/userModel')

async function create(req, res) {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    const error = new Error(errors.array()[0].msg)
    error.statusCode = 400
    throw error
  }
  const { advertisementId, sellerId, category, description } = req.body
  if (!advertisementId && !sellerId) {
    const error = new Error('Choose an advertisement or seller to report.')
    error.statusCode = 400
    throw error
  }
  if (advertisementId && sellerId) {
    const error = new Error('Report one advertisement or one seller at a time.')
    error.statusCode = 400
    throw error
  }
  if (advertisementId && !(await adModel.findPublicById(advertisementId))) {
    const error = new Error('The reported advertisement could not be found.')
    error.statusCode = 404
    throw error
  }
  if (sellerId && !(await userModel.findPublicSeller(sellerId))) {
    const error = new Error('The reported seller could not be found.')
    error.statusCode = 404
    throw error
  }
  const id = await adminModel.createReport({
    reporterId: req.user.id,
    advertisementId: advertisementId || null,
    sellerId: sellerId || null,
    category,
    description: description.trim(),
  })
  if (id === null) {
    const error = new Error('You have already submitted a similar report recently.')
    error.statusCode = 409
    throw error
  }
  if (id === 'rate_limited') {
    const error = new Error('You have reached the daily report limit. Please try again later.')
    error.statusCode = 429
    throw error
  }
  return res.status(201).json({ id, message: 'Your report has been submitted for review.' })
}

module.exports = { create }
