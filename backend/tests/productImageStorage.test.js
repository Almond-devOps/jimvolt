const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const { removeProductImages, storeProductImages } = require('../utils/productImageStorage')

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j4l8AAAAASUVORK5CYII=',
  'base64',
)

test('stores product images with unique safe names and removes them after use', async () => {
  const file = { buffer: png, mimetype: 'image/png', originalname: '../../malicious.png' }
  const stored = await storeProductImages([file, file])
  try {
    assert.equal(stored.length, 2)
    assert.notEqual(stored[0].path, stored[1].path)
    assert.match(stored[0].url, /^\/uploads\/products\/[a-f0-9-]{36}\.png$/)
    assert.deepEqual(await fs.readFile(stored[0].path), png)
  } finally {
    await removeProductImages(stored.map((image) => image.path))
  }
  await assert.rejects(fs.access(stored[0].path), { code: 'ENOENT' })
})

test('rejects files when MIME metadata does not match the image signature', async () => {
  await assert.rejects(
    storeProductImages([{ buffer: png, mimetype: 'image/jpeg' }]),
    { statusCode: 400, message: 'An image file has an invalid or unsupported file signature.' },
  )
})
