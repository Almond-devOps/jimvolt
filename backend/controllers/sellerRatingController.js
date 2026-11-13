const { validationResult } = require('express-validator')
const userModel = require('../models/userModel')
const ratings = require('../models/sellerRatingModel')

async function validateSeller(req) {
  const errors = validationResult(req)
  if (!errors.isEmpty()) throw Object.assign(new Error(errors.array()[0].msg), { statusCode: 400 })
  if (!await userModel.findPublicSeller(req.params.id)) {
    throw Object.assign(new Error('Seller not found.'), { statusCode: 404 })
  }
}

async function get(req, res) {
  await validateSeller(req)
  return res.json(await ratings.summary(req.params.id, req.user?.id))
}

async function save(req, res) {
  await validateSeller(req)
  if (String(req.user.id) === String(req.params.id)) {
    throw Object.assign(new Error('You cannot rate yourself.'), { statusCode: 400 })
  }
  return res.json(await ratings.save(req.params.id, req.user.id, Number(req.body.score)))
}

module.exports = { get, save }
