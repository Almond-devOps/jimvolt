const { createHash, randomUUID } = require('node:crypto')
const fs = require('node:fs/promises')
const path = require('node:path')
const { detectImageType } = require('./detectImageType')
const { rejectedUploadError } = require('./cloudinaryErrors')

const storageDirectory = path.resolve(__dirname, '..', 'uploads', 'products')
const imageTypes = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}
const managedPublicId = /^user_(\d+)\/([a-f0-9-]{36})$/i
const managedImageFile = /^([a-f0-9-]{36})\.(jpg|png|webp)$/i

function storageError(message, statusCode) {
  const error = new Error(message)
  error.statusCode = statusCode
  return error
}

function getSellerId(value) {
  const sellerId = String(value ?? '')
  if (!/^[1-9]\d*$/.test(sellerId)) {
    throw storageError('A valid seller is required to store product images.', 400)
  }
  return sellerId
}

function getCloudinaryConfig() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim()
  const apiKey = process.env.CLOUDINARY_API_KEY?.trim()
  const apiSecret = process.env.CLOUDINARY_API_SECRET?.trim()
  const configuredValues = [cloudName, apiKey, apiSecret].filter(Boolean).length
  if (configuredValues === 0 && process.env.NODE_ENV !== 'production') return null
  if (configuredValues !== 3 || !/^[a-z0-9-]+$/i.test(cloudName || '')) {
    throw storageError(
      'Image uploads are not set up on this server yet: Cloudinary storage is missing or incomplete (CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET). Please contact support.',
      503,
    )
  }
  return { cloudName, apiKey, apiSecret }
}

function signCloudinaryParams(params, apiSecret) {
  const serialized = Object.entries(params)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('&')
  return createHash('sha1').update(`${serialized}${apiSecret}`).digest('hex')
}

function cloudinaryUploadUrl(cloudName) {
  return `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`
}

function cloudinaryDestroyUrl(cloudName) {
  return `https://api.cloudinary.com/v1_1/${cloudName}/image/destroy`
}

function publicIdFromUrl(imageUrl, sellerId, cloudName) {
  if (typeof imageUrl !== 'string') return null
  let url
  try {
    url = new URL(imageUrl)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' || url.hostname !== 'res.cloudinary.com' || url.search || url.hash) return null

  const prefix = `/${cloudName}/image/upload/`
  if (!url.pathname.startsWith(prefix)) return null
  const resourcePath = url.pathname.slice(prefix.length).replace(/^v\d+\//, '')
  const match = resourcePath.match(/^jimvolt\/products\/user_(\d+)\/([a-f0-9-]{36})\.(jpg|png|webp)$/i)
  if (!match || match[1] !== sellerId) return null
  return `user_${match[1]}/${match[2]}`
}

function getManagedPublicId(image, sellerId, cloudName) {
  const imageUrl = typeof image === 'string' ? image : image?.url
  const fromUrl = publicIdFromUrl(imageUrl, sellerId, cloudName)
  if (!fromUrl) return null
  const publicId = typeof image === 'object' && image !== null ? image.publicId : null
  if (publicId !== null && publicId !== fromUrl) return null
  return fromUrl
}

async function uploadCloudinaryImage(file, sellerId, actualType, extension, config) {
  const publicId = `user_${sellerId}/${randomUUID()}`
  const timestamp = String(Math.floor(Date.now() / 1000))
  const params = { folder: 'jimvolt/products', public_id: publicId, timestamp }
  const formData = new FormData()
  formData.append('file', new Blob([file.buffer], { type: actualType }), `product.${extension}`)
  formData.append('api_key', config.apiKey)
  for (const [key, value] of Object.entries(params)) formData.append(key, value)
  formData.append('signature', signCloudinaryParams(params, config.apiSecret))

  let response
  try {
    response = await fetch(cloudinaryUploadUrl(config.cloudName), {
      method: 'POST',
      body: formData,
      signal: AbortSignal.timeout(30000),
    })
  } catch {
    throw storageError('Product image storage is temporarily unavailable.', 502)
  }
  if (!response.ok) throw await rejectedUploadError(response)

  let result
  try {
    result = await response.json()
  } catch {
    throw storageError('Product image storage returned an invalid response.', 502)
  }
  if (!result || typeof result !== 'object'
    || result.public_id !== publicId
    || publicIdFromUrl(result.secure_url, sellerId, config.cloudName) !== publicId) {
    throw storageError('Product image storage returned an invalid response.', 502)
  }
  return { url: result.secure_url, path: null, publicId }
}

function validateFile(file) {
  const actualType = detectImageType(file?.buffer)
  if (!actualType || actualType !== file.mimetype || !imageTypes[actualType]) {
    throw storageError(`${file?.originalname ? `"${file.originalname}"` : 'This file'} is not a valid JPG, PNG, WebP or HEIC image, or its file type does not match its contents.`, 400)
  }
  return { actualType, extension: imageTypes[actualType] }
}

async function storeLocalImage(file, extension) {
  const filename = `${randomUUID()}.${extension}`
  const absolutePath = path.join(storageDirectory, filename)
  let handle
  try {
    await fs.mkdir(storageDirectory, { recursive: true })
    handle = await fs.open(absolutePath, 'wx', 0o644)
    await handle.writeFile(file.buffer)
    return { url: `/uploads/products/${filename}`, path: absolutePath, publicId: null }
  } catch (error) {
    if (handle) await fs.unlink(absolutePath).catch(() => {})
    throw error
  } finally {
    await handle?.close()
  }
}

async function removeLocalImage(image) {
  const localPath = typeof image === 'object' && image !== null ? image.path : null
  if (typeof localPath !== 'string') return
  const resolvedPath = path.resolve(localPath)
  const filename = path.basename(resolvedPath)
  if (path.dirname(resolvedPath) !== storageDirectory || !managedImageFile.test(filename)) return
  try {
    await fs.unlink(resolvedPath)
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
}

async function deleteCloudinaryImage(publicId, config) {
  const params = { public_id: publicId, timestamp: String(Math.floor(Date.now() / 1000)) }
  const formData = new FormData()
  formData.append('api_key', config.apiKey)
  for (const [key, value] of Object.entries(params)) formData.append(key, value)
  formData.append('signature', signCloudinaryParams(params, config.apiSecret))

  let response
  try {
    response = await fetch(cloudinaryDestroyUrl(config.cloudName), {
      method: 'POST',
      body: formData,
      signal: AbortSignal.timeout(30000),
    })
  } catch {
    throw new Error('Product image storage could not remove a managed image.')
  }
  if (!response.ok) throw new Error('Product image storage could not remove a managed image.')

  let result
  try {
    result = await response.json()
  } catch {
    throw new Error('Product image storage returned an invalid removal response.')
  }
  if (result.result !== 'ok' && result.result !== 'not found') {
    throw new Error('Product image storage could not remove a managed image.')
  }
}

async function storeProductImages(files = [], seller) {
  if (!files.length) return []
  const sellerId = getSellerId(seller)
  const validatedFiles = files.map((file) => ({ file, ...validateFile(file) }))
  const cloudinary = getCloudinaryConfig()
  const stored = []
  try {
    for (const { file, actualType, extension } of validatedFiles) {
      stored.push(cloudinary
        ? await uploadCloudinaryImage(file, sellerId, actualType, extension, cloudinary)
        : await storeLocalImage(file, extension))
    }
    return stored
  } catch (error) {
    try {
      await removeProductImages(stored, sellerId)
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], 'Product image upload failed and uploaded images could not all be cleaned up.')
    }
    throw error
  }
}

async function removeProductImages(images = [], seller) {
  if (!images.length) return
  const sellerId = getSellerId(seller)
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim()
  const hasManagedCandidate = images.some((image) => {
    if (image && typeof image === 'object' && image.path) return false
    return cloudName && publicIdFromUrl(typeof image === 'string' ? image : image?.url, sellerId, cloudName)
  })
  const cloudinary = hasManagedCandidate ? getCloudinaryConfig() : null
  const outcomes = await Promise.allSettled(images.map(async (image) => {
    if (image && typeof image === 'object' && image.path) return removeLocalImage(image)
    if (!cloudinary) return
    const publicId = getManagedPublicId(image, sellerId, cloudinary.cloudName)
    if (!publicId) return
    const match = publicId.match(managedPublicId)
    if (!match || match[1] !== sellerId) return
    return deleteCloudinaryImage(publicId, cloudinary)
  }))
  const failures = outcomes
    .filter((outcome) => outcome.status === 'rejected')
    .map((outcome) => outcome.reason)
  if (failures.length) {
    throw new AggregateError(failures, 'One or more product images could not be removed.')
  }
}

module.exports = { removeProductImages, storeProductImages }
