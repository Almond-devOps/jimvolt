const fs = require('node:fs/promises')
const path = require('node:path')
const { createHash, randomUUID } = require('node:crypto')
const { detectImageType } = require('./detectImageType')
const { rejectedUploadError } = require('./cloudinaryErrors')

const storageDirectory = path.join(__dirname, '..', 'uploads', 'profiles')
const maxFileSize = 5 * 1024 * 1024
const extensionTypes = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
}
const imageExtensions = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}
const managedImagePath = /^\/uploads\/profiles\/[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}\.(?:jpg|png|webp)$/i
const managedCloudinaryProfilePath = /^jimvolt\/profiles\/user_(\d+)\/([a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12})\.(?:jpg|png|webp)$/i

function invalidImage(message) {
  const error = new Error(message)
  error.statusCode = 400
  return error
}

function getCloudinaryConfig() {
  const { CLOUDINARY_CLOUD_NAME: cloudName, CLOUDINARY_API_KEY: apiKey, CLOUDINARY_API_SECRET: apiSecret } = process.env
  if (!cloudName && !apiKey && !apiSecret) return null
  if (!cloudName || !apiKey || !apiSecret || !/^[a-z0-9-]+$/i.test(cloudName)) {
    const error = new Error('Image uploads are not set up on this server yet: Cloudinary storage is incomplete. Please contact support.')
    error.statusCode = 503
    throw error
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

function validateProfileImage(file) {
  if (!file || !Buffer.isBuffer(file.buffer)) {
    throw invalidImage('Choose a valid JPG, PNG, or WebP image.')
  }
  if (file.buffer.length > maxFileSize) {
    const error = invalidImage('Profile pictures must be 5 MB or smaller.')
    error.statusCode = 413
    throw error
  }

  const extension = path.extname(file.originalname || '').toLowerCase()
  const expectedType = extensionTypes[extension]
  const actualType = detectImageType(file.buffer)
  if (!expectedType || !imageExtensions[expectedType]
    || expectedType !== file.mimetype || actualType !== expectedType) {
    throw invalidImage('The selected file is not a valid JPG, PNG, or WebP image.')
  }
  return { actualType, extension: imageExtensions[actualType] }
}

async function storeCloudinaryProfileImage(file, userId, actualType, extension, config) {
  const publicId = `jimvolt/profiles/user_${userId}/${randomUUID()}`
  const params = {
    public_id: publicId,
    timestamp: String(Math.floor(Date.now() / 1000)),
  }
  const formData = new FormData()
  formData.append('file', new Blob([file.buffer], { type: actualType }), `profile.${extension}`)
  formData.append('api_key', config.apiKey)
  for (const [key, value] of Object.entries(params)) formData.append(key, value)
  formData.append('signature', signCloudinaryParams(params, config.apiSecret))

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${config.cloudName}/image/upload`,
    { method: 'POST', body: formData, signal: AbortSignal.timeout(30000) },
  )
  if (!response.ok) throw await rejectedUploadError(response)

  let result
  try {
    result = await response.json()
  } catch {
    const error = new Error('Image upload service returned an invalid response.')
    error.statusCode = 502
    throw error
  }
  if (!result || typeof result.secure_url !== 'string'
    || result.public_id !== publicId
    || getCloudinaryProfilePublicId(result.secure_url, userId, config.cloudName) !== publicId) {
    const error = new Error('Image upload service returned an invalid response.')
    error.statusCode = 502
    throw error
  }
  return { url: result.secure_url, path: null }
}

function getCloudinaryProfilePublicId(imageUrl, userId, cloudName) {
  if (typeof imageUrl !== 'string' || !/^\d+$/.test(String(userId))) return null
  let parsed
  try {
    parsed = new URL(imageUrl)
  } catch {
    return null
  }
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'res.cloudinary.com' || parsed.search || parsed.hash) return null

  const prefix = `/${cloudName}/image/upload/`
  if (!parsed.pathname.startsWith(prefix)) return null
  const resourcePath = parsed.pathname.slice(prefix.length).replace(/^v\d+\//, '')
  const match = resourcePath.match(managedCloudinaryProfilePath)
  if (!match || match[1] !== String(userId)) return null
  return `jimvolt/profiles/user_${match[1]}/${match[2]}`
}

async function deleteCloudinaryProfileImage(publicId, config) {
  const params = { public_id: publicId, timestamp: String(Math.floor(Date.now() / 1000)) }
  const formData = new FormData()
  formData.append('api_key', config.apiKey)
  for (const [key, value] of Object.entries(params)) formData.append(key, value)
  formData.append('signature', signCloudinaryParams(params, config.apiSecret))

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${config.cloudName}/image/destroy`,
    { method: 'POST', body: formData, signal: AbortSignal.timeout(30000) },
  )
  if (!response.ok) throw new Error('Image storage service could not remove the previous profile image.')

  let result
  try {
    result = await response.json()
  } catch {
    throw new Error('Image storage service returned an invalid removal response.')
  }
  if (result.result !== 'ok' && result.result !== 'not found') {
    throw new Error('Image storage service could not remove the previous profile image.')
  }
}

async function storeProfileImage(file, userId) {
  const { actualType, extension } = validateProfileImage(file)
  const cloudinary = getCloudinaryConfig()
  if (cloudinary) return storeCloudinaryProfileImage(file, userId, actualType, extension, cloudinary)

  await fs.mkdir(storageDirectory, { recursive: true })
  const filename = `${randomUUID()}.${imageExtensions[actualType]}`
  const absolutePath = path.join(storageDirectory, filename)
  let handle
  try {
    handle = await fs.open(absolutePath, 'wx', 0o644)
    await handle.writeFile(file.buffer)
  } catch (error) {
    if (handle) {
      await fs.unlink(absolutePath).catch((cleanupError) => {
        if (cleanupError.code !== 'ENOENT') console.error('Could not clean up an incomplete profile image:', cleanupError.message)
      })
    }
    throw error
  } finally {
    await handle?.close()
  }

  return { url: `/uploads/profiles/${filename}`, path: absolutePath }
}

async function removeProfileImage(imageUrl, userId) {
  if (typeof imageUrl === 'string' && managedImagePath.test(imageUrl)) {
    const filename = path.posix.basename(imageUrl)
    const absolutePath = path.resolve(storageDirectory, filename)
    if (path.dirname(absolutePath) !== storageDirectory) return

    try {
      await fs.unlink(absolutePath)
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
    return
  }

  const cloudinary = getCloudinaryConfig()
  if (!cloudinary) return
  const publicId = getCloudinaryProfilePublicId(imageUrl, userId, cloudinary.cloudName)
  if (publicId) await deleteCloudinaryProfileImage(publicId, cloudinary)
}

module.exports = { maxFileSize, removeProfileImage, storeProfileImage }
