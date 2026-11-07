const fs = require('node:fs/promises')
const path = require('node:path')
const { randomUUID } = require('node:crypto')
const { detectImageType } = require('./detectImageType')

const storageDirectory = path.join(__dirname, '..', 'uploads', 'products')
const imageTypes = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

async function storeProductImages(files = []) {
  const stored = []
  await fs.mkdir(storageDirectory, { recursive: true })
  try {
    for (const file of files) {
      const actualType = detectImageType(file.buffer)
      if (!actualType || actualType !== file.mimetype || !imageTypes[actualType]) {
        const error = new Error('An image file has an invalid or unsupported file signature.')
        error.statusCode = 400
        throw error
      }

      const filename = `${randomUUID()}.${imageTypes[actualType]}`
      const absolutePath = path.join(storageDirectory, filename)
      const handle = await fs.open(absolutePath, 'wx', 0o644)
      stored.push({ url: `/uploads/products/${filename}`, path: absolutePath })
      try {
        await handle.writeFile(file.buffer)
      } finally {
        await handle.close()
      }
    }
    return stored
  } catch (error) {
    await removeProductImages(stored.map((image) => image.path))
    throw error
  }
}

async function removeProductImages(paths) {
  const results = await Promise.allSettled(paths.map((filePath) => fs.unlink(filePath)))
  const failures = results
    .filter((result) => result.status === 'rejected' && result.reason.code !== 'ENOENT')
    .map((result) => result.reason)
  if (failures.length) throw new AggregateError(failures, 'One or more product images could not be removed.')
}

module.exports = { removeProductImages, storeProductImages }
