const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const { maxFileSize, removeProfileImage, storeProfileImage } = require('../utils/profileImageStorage')

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j4l8AAAAASUVORK5CYII=',
  'base64',
)

test('stores profile images under unique server-generated names and deletes managed images', async () => {
  const cloudinaryKeys = ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET']
  const originalCloudinaryConfig = cloudinaryKeys.map((key) => process.env[key])
  cloudinaryKeys.forEach((key) => { delete process.env[key] })
  const file = { buffer: png, mimetype: 'image/png', originalname: '../../avatar.png' }
  const storedImages = []
  try {
    const first = await storeProfileImage(file, 42)
    storedImages.push(first)
    const second = await storeProfileImage(file, 42)
    storedImages.push(second)
    assert.notEqual(first.path, second.path)
    assert.match(first.url, /^\/uploads\/profiles\/[a-f0-9-]{36}\.png$/)
    assert.deepEqual(await fs.readFile(first.path), png)
    await removeProfileImage(first.url, 42)
    storedImages.shift()
    await assert.rejects(fs.access(first.path), { code: 'ENOENT' })
  } finally {
    await Promise.all(storedImages.map((image) => removeProfileImage(image.url, 42)))
    cloudinaryKeys.forEach((key, index) => {
      if (originalCloudinaryConfig[index] === undefined) delete process.env[key]
      else process.env[key] = originalCloudinaryConfig[index]
    })
  }
})

test('stores JPEG and WebP files when signatures match their MIME types and extensions', async () => {
  const cloudinaryKeys = ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET']
  const originalCloudinaryConfig = cloudinaryKeys.map((key) => process.env[key])
  cloudinaryKeys.forEach((key) => { delete process.env[key] })
  const storedImages = []
  try {
    const jpeg = await storeProfileImage({
      buffer: Buffer.from([0xff, 0xd8, 0xff, 0x00]),
      mimetype: 'image/jpeg',
      originalname: 'avatar.jpeg',
    }, 42)
    storedImages.push(jpeg)
    const webp = await storeProfileImage({
      buffer: Buffer.from('RIFF0000WEBP'),
      mimetype: 'image/webp',
      originalname: 'avatar.webp',
    }, 42)
    storedImages.push(webp)
    assert.match(jpeg.url, /^\/uploads\/profiles\/[a-f0-9-]{36}\.jpg$/)
    assert.match(webp.url, /^\/uploads\/profiles\/[a-f0-9-]{36}\.webp$/)
  } finally {
    await Promise.all(storedImages.map((image) => removeProfileImage(image.url, 42)))
    cloudinaryKeys.forEach((key, index) => {
      if (originalCloudinaryConfig[index] === undefined) delete process.env[key]
      else process.env[key] = originalCloudinaryConfig[index]
    })
  }
})

test('rejects invalid extension, MIME, and image signature combinations', async () => {
  await assert.rejects(
    storeProfileImage({ buffer: png, mimetype: 'image/png', originalname: 'avatar.jpg' }),
    { statusCode: 400 },
  )
  await assert.rejects(
    storeProfileImage({ buffer: png, mimetype: 'image/jpeg', originalname: 'avatar.jpg' }),
    { statusCode: 400 },
  )
  await assert.rejects(
    storeProfileImage({ buffer: Buffer.from('not an image'), mimetype: 'image/png', originalname: 'avatar.png' }),
    { statusCode: 400 },
  )
})

test('rejects images larger than 5 MB', async () => {
  await assert.rejects(
    storeProfileImage({ buffer: Buffer.alloc(maxFileSize + 1), mimetype: 'image/png', originalname: 'avatar.png' }),
    { statusCode: 413 },
  )
})

test('does not remove files outside the managed profile image path', async () => {
  await assert.doesNotReject(removeProfileImage('/uploads/products/00000000-0000-0000-0000-000000000000.png', 42))
  await assert.doesNotReject(removeProfileImage('https://example.com/uploads/profiles/00000000-0000-0000-0000-000000000000.png', 42))
})

test('uses configured Cloudinary storage and only deletes images owned by that user', async () => {
  const cloudinaryKeys = ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET']
  const originalCloudinaryConfig = cloudinaryKeys.map((key) => process.env[key])
  const originalFetch = global.fetch
  process.env.CLOUDINARY_CLOUD_NAME = 'jimvolt-test'
  process.env.CLOUDINARY_API_KEY = 'test-key'
  process.env.CLOUDINARY_API_SECRET = 'test-secret'
  const requests = []
  global.fetch = async (url, options) => {
    requests.push({ url, options })
    const publicId = options.body.get('public_id')
    if (url.endsWith('/image/upload')) {
      return new Response(JSON.stringify({
        secure_url: `https://res.cloudinary.com/jimvolt-test/image/upload/v123/${publicId}.png`,
        public_id: publicId,
      }), { status: 200 })
    }
    return new Response(JSON.stringify({ result: 'ok' }), { status: 200 })
  }

  try {
    const stored = await storeProfileImage({ buffer: png, mimetype: 'image/png', originalname: 'avatar.png' }, 42)
    assert.match(stored.url, /^https:\/\/res\.cloudinary\.com\/jimvolt-test\/image\/upload\/v123\/jimvolt\/profiles\/user_42\/[a-f0-9-]{36}\.png$/)
    assert.equal(stored.path, null)
    await removeProfileImage(stored.url, 43)
    assert.equal(requests.length, 1)
    await removeProfileImage(stored.url, 42)
    assert.equal(requests.length, 2)
    assert.equal(requests[1].url.endsWith('/image/destroy'), true)
    assert.equal(requests[1].options.body.get('public_id'), stored.url.split('/').slice(-4).join('/').replace(/\.png$/, ''))
  } finally {
    global.fetch = originalFetch
    cloudinaryKeys.forEach((key, index) => {
      if (originalCloudinaryConfig[index] === undefined) delete process.env[key]
      else process.env[key] = originalCloudinaryConfig[index]
    })
  }
})
