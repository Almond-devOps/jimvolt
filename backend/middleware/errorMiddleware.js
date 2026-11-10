function asyncHandler(handler) {
  return function wrappedHandler(req, res, next) {
    Promise.resolve(handler(req, res, next)).catch(next)
  }
}

function notFound(req, res, next) {
  const error = new Error(`Route not found: ${req.method} ${req.originalUrl}`)
  error.statusCode = 404
  next(error)
}

function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error)

  const statusCode = error.statusCode || (error.code === 'ER_DUP_ENTRY' ? 409 : 500)
  if (statusCode >= 500) console.error(error)

  const databaseUnavailable = [
    'ECONNREFUSED',
    'ETIMEDOUT',
    'PROTOCOL_CONNECTION_LOST',
    'ER_ACCESS_DENIED_ERROR',
    'ER_BAD_DB_ERROR',
  ].includes(error.code)

  res.status(statusCode).json({
    message:
      error.code === 'ER_DUP_ENTRY'
        ? 'An account or record with those details already exists.'
        : databaseUnavailable
          ? 'Database connection failed. Please try again later.'
        : statusCode >= 500 && !(error.statusCode && [502, 503].includes(statusCode))
          ? 'Server error. Please try again later.'
          : error.message,
  })
}

module.exports = { asyncHandler, errorHandler, notFound }
