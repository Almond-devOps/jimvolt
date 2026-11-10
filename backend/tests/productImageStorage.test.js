const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const { removeProductImages, storeProductImages } = require('../utils/productImageStorage')

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j4l8AAAAASUVORK5CYII=',
  'base64',
)
const cloudinaryVariables = ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET']

async function withEnvironment(values, callback) {
  const keys = new Set([...Object.keys(values), ...cloudinaryVariables])
  const previous = new Map([...keys].map((key) => [key, process.env[key]]))
  const originalFetch = global.fetch
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  try {
    await callback()
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    global.fetch = originalFetch
  }
}

function configureCloudinary() {
  process.env.CLOUDINARY_CLOUD_NAME = 'jimvolt-test'
  process.env.CLOUDINARY_API_KEY = 'test-key'
  process.env.CLOUDINARY_API_SECRET = 'test-secret'
}

function jsonResponse(body, ok = true) {
  return { ok, json: async () => body }
}

function cloudinaryUploadResponse(formData) {
  const publicId = formData.get('public_id')
  return jsonResponse({
    public_id: publicId,
    secure_url: `https://res.cloudinary.com/jimvolt-test/image/upload/v123/jimvolt/products/${publicId}.png`,
  })
}

test('uploads valid product images to the seller folder with unique Cloudinary public IDs', async () => {
  await withEnvironment({ NODE_ENV: 'production' }, async () => {
    configureCloudinary()
    const calls = []
    global.fetch = async (url, options) => {
      calls.push({ url, options })
      return cloudinaryUploadResponse(options.body)
    }

    const stored = await storeProductImages([
      { buffer: png, mimetype: 'image/png' },
      { buffer: png, mimetype: 'image/png' },
    ], 17)

    assert.equal(stored.length, 2)
    assert.equal(stored[0].path, null)
    assert.match(stored[0].url, /^https:\/\/res\.cloudinary\.com\/jimvolt-test\/image\/upload\/v123\/jimvolt\/products\/user_17\/[a-f0-9-]{36}\.png$/)
    assert.match(stored[0].publicId, /^user_17\/[a-f0-9-]{36}$/)
    assert.notEqual(stored[0].publicId, stored[1].publicId)
    assert.equal(calls.length, 2)
    assert.deepEqual(calls.map(({ options }) => options.body.get('folder')), [
      'jimvolt/products',
      'jimvolt/products',
    ])
    assert.deepEqual(calls.map(({ options }) => options.body.get('public_id')), stored.map((image) => image.publicId))
  })
})

test('rejects product images whose actual signature does not match the declared type', async () => {
  await withEnvironment({ NODE_ENV: 'production' }, async () => {
    configureCloudinary()
    let uploadAttempted = false
    global.fetch = async () => {
      uploadAttempted = true
      return jsonResponse({})
    }

    await assert.rejects(
      storeProductImages([{ buffer: png, mimetype: 'image/jpeg' }], 17),
      { statusCode: 400, message: 'This file is not a valid JPG, PNG, WebP or HEIC image, or its file type does not match its contents.' },
    )
    await assert.rejects(
      storeProductImages([{ buffer: Buffer.from('not an image'), mimetype: 'image/png' }], 17),
      { statusCode: 400, message: 'This file is not a valid JPG, PNG, WebP or HEIC image, or its file type does not match its contents.' },
    )
    assert.equal(uploadAttempted, false)
  })
})

test('removes earlier Cloudinary uploads when a later upload fails', async () => {
  await withEnvironment({ NODE_ENV: 'production' }, async () => {
    configureCloudinary()
    const calls = []
    global.fetch = async (url, options) => {
      calls.push({ url, options })
      if (calls.length === 1) return cloudinaryUploadResponse(options.body)
      if (calls.length === 2) return jsonResponse({ error: { message: 'upload failed' } }, false)
      return jsonResponse({ result: 'ok' })
    }

    await assert.rejects(storeProductImages([
      { buffer: png, mimetype: 'image/png' },
      { buffer: png, mimetype: 'image/png' },
    ], 17), { statusCode: 502 })

    assert.equal(calls.length, 3)
    assert.match(calls[2].url, /\/image\/destroy$/)
    assert.equal(calls[2].options.body.get('public_id'), calls[0].options.body.get('public_id'))
  })
})

test('returns a service error when Cloudinary returns an invalid upload response', async () => {
  await withEnvironment({ NODE_ENV: 'production' }, async () => {
    configureCloudinary()
    global.fetch = async () => jsonResponse(null)

    await assert.rejects(
      storeProductImages([{ buffer: png, mimetype: 'image/png' }], 17),
      { statusCode: 502, message: 'Product image storage returned an invalid response.' },
    )
  })
})

test('does not delete a product image belonging to a different seller', async () => {
  await withEnvironment({ NODE_ENV: 'production' }, async () => {
    configureCloudinary()
    let deleteAttempted = false
    global.fetch = async () => {
      deleteAttempted = true
      return jsonResponse({ result: 'ok' })
    }

    await removeProductImages([{
      url: 'https://res.cloudinary.com/jimvolt-test/image/upload/v123/jimvolt/products/user_42/123e4567-e89b-12d3-a456-426614174000.png',
      path: null,
      publicId: 'user_42/123e4567-e89b-12d3-a456-426614174000',
    }], 17)
    assert.equal(deleteAttempted, false)
  })
})

test('deletes only an uploaded Cloudinary image owned by the requested seller', async () => {
  await withEnvironment({ NODE_ENV: 'production' }, async () => {
    configureCloudinary()
    const calls = []
    global.fetch = async (url, options) => {
      calls.push({ url, options })
      if (calls.length === 1) return cloudinaryUploadResponse(options.body)
      return jsonResponse({ result: 'ok' })
    }

    const [image] = await storeProductImages([{ buffer: png, mimetype: 'image/png' }], 17)
    await removeProductImages([image], 17)

    assert.equal(calls.length, 2)
    assert.match(calls[1].url, /\/image\/destroy$/)
    assert.equal(calls[1].options.body.get('public_id'), image.publicId)
  })
})

test('does not delete arbitrary external image URLs', async () => {
  await withEnvironment({ NODE_ENV: 'production' }, async () => {
    configureCloudinary()
    let deleteAttempted = false
    global.fetch = async () => {
      deleteAttempted = true
      return jsonResponse({ result: 'ok' })
    }

    await removeProductImages([{ url: 'https://images.example.com/product.png', path: null }], 17)
    assert.equal(deleteAttempted, false)
  })
})

test('uses local disk storage in development and tests when Cloudinary is not configured', async () => {
  for (const nodeEnv of ['development', 'test']) {
    await withEnvironment({
      NODE_ENV: nodeEnv,
      CLOUDINARY_CLOUD_NAME: undefined,
      CLOUDINARY_API_KEY: undefined,
      CLOUDINARY_API_SECRET: undefined,
    }, async () => {
      const stored = await storeProductImages([{ buffer: png, mimetype: 'image/png' }], 17)
      try {
        assert.equal(stored.length, 1)
        assert.equal(stored[0].publicId, null)
        assert.match(stored[0].url, /^\/uploads\/products\/[a-f0-9-]{36}\.png$/)
        assert.deepEqual(await fs.readFile(stored[0].path), png)
      } finally {
        await removeProductImages(stored, 17)
      }
      await assert.rejects(fs.access(stored[0].path), { code: 'ENOENT' })
    })
  }
})

test('returns a clear service-unavailable error when production Cloudinary configuration is missing', async () => {
  await withEnvironment({
    NODE_ENV: 'production',
    CLOUDINARY_CLOUD_NAME: undefined,
    CLOUDINARY_API_KEY: undefined,
    CLOUDINARY_API_SECRET: undefined,
  }, async () => {
    await assert.rejects(
      storeProductImages([{ buffer: png, mimetype: 'image/png' }], 17),
      { statusCode: 503, message: 'Image uploads are not set up on this server yet: Cloudinary storage is missing or incomplete (CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET). Please contact support.' },
    )
  })
})

test('rejects incomplete production Cloudinary configuration instead of using local disk', async () => {
  await withEnvironment({
    NODE_ENV: 'production',
    CLOUDINARY_CLOUD_NAME: 'jimvolt-test',
    CLOUDINARY_API_KEY: undefined,
    CLOUDINARY_API_SECRET: 'test-secret',
  }, async () => {
    await assert.rejects(
      storeProductImages([{ buffer: png, mimetype: 'image/png' }], 17),
      { statusCode: 503, message: 'Image uploads are not set up on this server yet: Cloudinary storage is missing or incomplete (CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET). Please contact support.' },
    )
  })
})
