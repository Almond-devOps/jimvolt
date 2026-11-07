const multer = require('multer')

const maxFileSize = Math.max(1, Number.parseInt(process.env.PRODUCT_IMAGE_MAX_FILE_SIZE_MB, 10) || 5) * 1024 * 1024
const maxFiles = Math.min(10, Math.max(1, Number.parseInt(process.env.PRODUCT_IMAGE_MAX_COUNT, 10) || 10))
const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp'])

const parser = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maxFileSize, files: maxFiles, fields: 20, fieldSize: 1024 * 1024 },
  fileFilter(req, file, callback) {
    if (!allowedTypes.has(file.mimetype)) {
      const error = new Error('Use JPG, PNG, or WebP images only.')
      error.statusCode = 400
      callback(error)
      return
    }
    callback(null, true)
  },
}).array('images', maxFiles)

function productImageUpload(req, res, next) {
  parser(req, res, (error) => {
    if (!error) return next()
    if (error.code === 'LIMIT_FILE_SIZE') error.message = `Each image must be ${Math.floor(maxFileSize / (1024 * 1024))} MB or smaller.`
    if (error.code === 'LIMIT_FILE_COUNT') error.message = `You can upload up to ${maxFiles} images.`
    if (error.code === 'LIMIT_UNEXPECTED_FILE') error.message = `You can upload up to ${maxFiles} images using the images field.`
    error.statusCode = 400
    return next(error)
  })
}

module.exports = { maxFiles, maxFileSize, productImageUpload }
