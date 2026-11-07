const multer = require('multer')

const parser = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 4, fields: 0 },
  fileFilter(req, file, callback) {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
    if (!allowed.includes(file.mimetype)) {
      const error = new Error('Use JPG, PNG, WebP, or GIF images only.')
      error.statusCode = 400
      callback(error)
      return
    }
    callback(null, true)
  },
}).array('images', 4)

function messageImageUpload(req, res, next) {
  parser(req, res, (error) => {
    if (!error) return next()
    if (error.code === 'LIMIT_FILE_SIZE') error.message = 'Each image must be 5 MB or smaller.'
    if (error.code === 'LIMIT_FILE_COUNT') error.message = 'You can attach up to four images per message.'
    error.statusCode = 400
    return next(error)
  })
}

module.exports = messageImageUpload
