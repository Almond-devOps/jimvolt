const jwt = require('jsonwebtoken')
const userModel = require('../models/userModel')
const { tokenVersionMatches } = require('../utils/tokenVersion')
const { asyncHandler } = require('./errorMiddleware')

const authenticate = asyncHandler(async (req, res, next) => {
  const authorization = req.get('authorization')
  const [scheme, token] = authorization ? authorization.split(' ') : []

  if (scheme !== 'Bearer' || !token) {
    const error = new Error('Authentication is required.')
    error.statusCode = 401
    throw error
  }

  let payload
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET)
  } catch {
    const error = new Error('The authentication token is invalid or expired.')
    error.statusCode = 401
    throw error
  }

  const user = await userModel.findById(payload.sub)
  if (!user || user.account_status !== 'active') {
    const error = new Error('This account is unavailable.')
    error.statusCode = 401
    throw error
  }
  if (!tokenVersionMatches(payload.tokenVersion, user.token_version)) {
    const error = new Error('The authentication token is invalid or expired.')
    error.statusCode = 401
    throw error
  }

  req.user = user
  next()
})

const optionalAuthenticate = asyncHandler(async (req, res, next) => {
  if (!req.get('authorization')) return next()
  return authenticate(req, res, next)
})

authenticate.optional = optionalAuthenticate
module.exports = authenticate
