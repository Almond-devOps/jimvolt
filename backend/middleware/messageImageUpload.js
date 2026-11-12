const multer = require('multer')
const { heicMimeTypes, looksLikeHeic, normalizeHeicFiles } = require('../utils/heic')

const parser = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 4, fields: 0 },
  fileFilter(req, file, callback) {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
    if (!allowed.includes(file.mimetype) && !heicMimeTypes.has(file.mimetype) && !looksLikeHeic(file)) {
      const error = new Error(`"${file.originalname}" is not a supported image. Use JPG, PNG, WebP, GIF or iPhone HEIC photos.`)
      error.statusCode = 400
      callback(error)
      return
    }
    callback(null, true)
  },
}).array('images', 4)

function messageImageUpload(req, res, next) {
  parser(req, res, (error) => {
    if (!error) return normalizeHeicFiles(req.files).then(() => next(), next)
    if (error.code === 'LIMIT_FILE_SIZE') error.message = 'Each image must be 5 MB or smaller.'
    if (error.code === 'LIMIT_FILE_COUNT') error.message = 'You can attach up to four images per message.'
    error.statusCode = 400
    return next(error)
  })
}

module.exports = messageImageUpload
