const { validationResult } = require('express-validator')
const discoveryModel = require('../models/discoveryModel')

function checkValidation(req) {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    const error = new Error(errors.array()[0].msg)
    error.statusCode = 400
    throw error
  }
}

function paging(query) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1)
  const limit = Math.min(50, Math.max(1, Number.parseInt(query.limit, 10) || 20))
  return { page, limit }
}

function validationError(message, statusCode = 400) {
  const error = new Error(message)
  error.statusCode = statusCode
  return error
}

async function addFavorite(req, res) {
  checkValidation(req)
  const result = await discoveryModel.addFavorite(req.user.id, req.params.id)
  if (!result) throw validationError('Advertisement not found or no longer available.', 404)
  return res.status(result.added ? 201 : 200).json({
    message: result.added ? 'Advertisement added to saved products.' : 'Advertisement is already saved.',
    added: result.added,
    count: await discoveryModel.favoriteCount(req.user.id),
  })
}

async function removeFavorite(req, res) {
  checkValidation(req)
  await discoveryModel.removeFavorite(req.user.id, req.params.id)
  return res.json({
    message: 'Advertisement removed from saved products.',
    count: await discoveryModel.favoriteCount(req.user.id),
  })
}

async function removeFavoriteById(req, res) {
  checkValidation(req)
  await discoveryModel.removeFavoriteById(req.user.id, req.params.id)
  return res.json({
    message: 'Advertisement removed from saved products.',
    count: await discoveryModel.favoriteCount(req.user.id),
  })
}

async function clearFavorites(req, res) {
  const removed = await discoveryModel.clearFavorites(req.user.id)
  return res.json({ message: 'Saved products cleared.', removed, count: 0 })
}

async function listFavorites(req, res) {
  checkValidation(req)
  const { page, limit } = paging(req.query)
  const result = await discoveryModel.listFavorites(req.user.id, {
    q: String(req.query.q || '').trim().slice(0, 100),
    category: req.query.category ? Number(req.query.category) : null,
    sort: req.query.sort || 'newest',
    page,
    limit,
  })
  return res.json({
    ...result,
    favoriteIds: await discoveryModel.favoriteIds(req.user.id),
    pagination: { page, limit, total: result.total, pages: Math.ceil(result.total / limit) },
  })
}

async function favoriteCount(req, res) {
  return res.json({ count: await discoveryModel.favoriteCount(req.user.id) })
}

async function preferences(req, res) {
  return res.json(await discoveryModel.getPreferences(req.user.id))
}

async function updatePreferences(req, res) {
  checkValidation(req)
  return res.json(await discoveryModel.setPreferences(
    req.user.id, req.body.notifyPriceDrops,
  ))
}

async function trackView(req, res) {
  checkValidation(req)
  const adModel = require('../models/adModel')
  const advertisement = await adModel.findPublicById(req.params.id)
  if (!advertisement) throw validationError('Advertisement not found or no longer available.', 404)
  await discoveryModel.trackView(req.user.id, advertisement.id)
  return res.status(204).end()
}

async function listRecentlyViewed(req, res) {
  checkValidation(req)
  const { page, limit } = paging(req.query)
  const result = await discoveryModel.listRecentlyViewed(req.user.id, { page, limit })
  return res.json({
    ...result,
    pagination: { page, limit, total: result.total, pages: Math.ceil(result.total / limit) },
  })
}

async function importRecentlyViewed(req, res) {
  checkValidation(req)
  const imported = await discoveryModel.importRecentlyViewed(req.user.id, req.body.advertisementIds)
  return res.json({ imported })
}

async function removeRecentlyViewed(req, res) {
  checkValidation(req)
  await discoveryModel.removeRecentlyViewed(req.user.id, req.params.id)
  return res.json({ message: 'Product removed from recently viewed.' })
}

async function clearRecentlyViewed(req, res) {
  const removed = await discoveryModel.clearRecentlyViewed(req.user.id)
  return res.json({ message: 'Recently viewed history cleared.', removed })
}

async function priceHistory(req, res) {
  checkValidation(req)
  const adModel = require('../models/adModel')
  const advertisement = await adModel.findPublicById(req.params.id)
  if (!advertisement) throw validationError('Advertisement not found or no longer available.', 404)
  return res.json({ history: await discoveryModel.getPriceHistory(req.params.id) })
}

module.exports = {
  addFavorite,
  clearFavorites,
  clearRecentlyViewed,
  favoriteCount,
  listFavorites,
  listRecentlyViewed,
  importRecentlyViewed,
  preferences,
  priceHistory,
  removeFavorite,
  removeFavoriteById,
  removeRecentlyViewed,
  trackView,
  updatePreferences,
}
