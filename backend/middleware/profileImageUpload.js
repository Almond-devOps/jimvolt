const multer = require('multer')
const path = require('node:path')
const { heicMimeTypes, looksLikeHeic, normalizeHeicFiles } = require('../utils/heic')

const maxFileSize = 5 * 1024 * 1024
const allowedExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif'])
const allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp', ...heicMimeTypes])

const parser = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maxFileSize, files: 1, fields: 2, parts: 3, fieldSize: 64 * 1024 },
  fileFilter(req, file, callback) {
    const extension = path.extname(file.originalname).toLowerCase()
    if (!allowedExtensions.has(extension) || (!allowedMimeTypes.has(file.mimetype) && !looksLikeHeic(file))) {
      const error = new Error('Choose a JPG, PNG, WebP or iPhone HEIC photo.')
      error.statusCode = 400
      callback(error)
      return
    }
    callback(null, true)
  },
}).single('profileImage')

function profileImageUpload(req, res, next) {
  parser(req, res, (error) => {
    if (!error) return normalizeHeicFiles(req.file ? [req.file] : []).then(() => next(), next)
    if (error.code === 'LIMIT_FILE_SIZE') {
      error.message = 'Profile pictures must be 5 MB or smaller.'
      error.statusCode = 413
    } else {
      if (error.code === 'LIMIT_UNEXPECTED_FILE') error.message = 'Upload one image using the profileImage field.'
      error.statusCode = 400
    }
    return next(error)
  })
}

module.exports = { maxFileSize, profileImageUpload }
