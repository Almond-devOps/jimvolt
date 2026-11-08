const assert = require('node:assert/strict')
const http = require('node:http')
const path = require('node:path')
const test = require('node:test')
const express = require('express')
const jwt = require('jsonwebtoken')
const { pool } = require('../config/database')
const userRoutes = require('../routes/userRoutes')
const { errorHandler } = require('../middleware/errorMiddleware')
const { removeProfileImage } = require('../utils/profileImageStorage')

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j4l8AAAAASUVORK5CYII=',
  'base64',
)

test('authenticated profile image routes validate, serve, replace, and remove only the signed-in user image', async (t) => {
  const originalSecret = process.env.JWT_SECRET
  const originalExecute = pool.execute
  const cloudinaryKeys = ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET']
  const originalCloudinaryConfig = cloudinaryKeys.map((key) => process.env[key])
  cloudinaryKeys.forEach((key) => { delete process.env[key] })
  process.env.JWT_SECRET = 'profile-image-route-test-secret-at-least-32-characters'
  const user = {
    id: 42,
    full_name: 'Test User',
    email: 'test@example.com',
    phone: null,
    role: 'user',
    profile_image: null,
    token_version: 0,
    account_status: 'active',
    is_verified: false,
    created_at: new Date('2024-01-01T00:00:00.000Z'),
    password_reset_token: null,
    password_reset_expires_at: null,
  }
  const updates = []
  pool.execute = async (query, values = []) => {
    if (query.includes('WHERE id = ? LIMIT 1')) return [[{ ...user }]]
    if (query.includes('SET full_name = ?')) {
      const [fullName, phone, profileImage, id] = values
      updates.push(id)
      Object.assign(user, { full_name: fullName, phone, profile_image: profileImage })
      return [{ affectedRows: 1 }]
    }
    if (query.includes('SET profile_image = ?')) {
      const [profileImage, id] = values
      updates.push(id)
      user.profile_image = profileImage
      return [{ affectedRows: 1 }]
    }
    throw new Error(`Unexpected database query in profile image test: ${query}`)
  }

  const app = express()
  app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')))
  app.use('/api/users', userRoutes)
  app.use(errorHandler)
  const server = http.createServer(app)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const baseUrl = `http://127.0.0.1:${server.address().port}`
  const token = jwt.sign({ sub: String(user.id), tokenVersion: user.token_version }, process.env.JWT_SECRET)

  t.after(async () => {
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
    await removeProfileImage(user.profile_image, user.id)
    pool.execute = originalExecute
    if (originalSecret === undefined) delete process.env.JWT_SECRET
    else process.env.JWT_SECRET = originalSecret
    cloudinaryKeys.forEach((key, index) => {
      if (originalCloudinaryConfig[index] === undefined) delete process.env[key]
      else process.env[key] = originalCloudinaryConfig[index]
    })
  })

  const unauthenticatedUpload = await fetch(`${baseUrl}/api/users/profile`, { method: 'PUT' })
  assert.equal(unauthenticatedUpload.status, 401)
  const unauthenticatedRemoval = await fetch(`${baseUrl}/api/users/profile/image`, { method: 'DELETE' })
  assert.equal(unauthenticatedRemoval.status, 401)

  const invalidType = new FormData()
  invalidType.set('fullName', 'Test User')
  invalidType.set('phone', '')
  invalidType.set('profileImage', new Blob(['not an image'], { type: 'image/gif' }), 'avatar.gif')
  const invalidTypeResponse = await fetch(`${baseUrl}/api/users/profile`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}` },
    body: invalidType,
  })
  assert.equal(invalidTypeResponse.status, 400)

  const invalidSignature = new FormData()
  invalidSignature.set('fullName', 'Test User')
  invalidSignature.set('phone', '')
  invalidSignature.set('profileImage', new Blob(['not a png'], { type: 'image/png' }), 'avatar.png')
  const invalidSignatureResponse = await fetch(`${baseUrl}/api/users/profile`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}` },
    body: invalidSignature,
  })
  assert.equal(invalidSignatureResponse.status, 400)

  const oversized = new FormData()
  oversized.set('fullName', 'Test User')
  oversized.set('phone', '')
  oversized.set('profileImage', new Blob([Buffer.alloc(5 * 1024 * 1024 + 1)], { type: 'image/png' }), 'avatar.png')
  const oversizedResponse = await fetch(`${baseUrl}/api/users/profile`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}` },
    body: oversized,
  })
  assert.equal(oversizedResponse.status, 413)

  const upload = new FormData()
  upload.set('fullName', 'Test User')
  upload.set('phone', '')
  upload.set('profileImage', new Blob([png], { type: 'image/png' }), '../../avatar.png')
  const uploadResponse = await fetch(`${baseUrl}/api/users/profile?userId=99`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}` },
    body: upload,
  })
  assert.equal(uploadResponse.status, 200)
  const uploaded = await uploadResponse.json()
  assert.equal(uploaded.user.id, user.id)
  assert.match(uploaded.user.profile_image, /^\/uploads\/profiles\/[a-f0-9-]{36}\.png$/)
  assert.deepEqual(updates, [user.id])

  const displayedImage = await fetch(`${baseUrl}${uploaded.user.profile_image}`)
  assert.equal(displayedImage.status, 200)
  assert.deepEqual(Buffer.from(await displayedImage.arrayBuffer()), png)

  const invalidReplacement = new FormData()
  invalidReplacement.set('fullName', 'Test User')
  invalidReplacement.set('phone', '')
  invalidReplacement.set('profileImage', new Blob(['not a png'], { type: 'image/png' }), 'replacement.png')
  const invalidReplacementResponse = await fetch(`${baseUrl}/api/users/profile`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}` },
    body: invalidReplacement,
  })
  assert.equal(invalidReplacementResponse.status, 400)
  assert.equal(user.profile_image, uploaded.user.profile_image)
  assert.equal((await fetch(`${baseUrl}${uploaded.user.profile_image}`)).status, 200)

  const replacement = new FormData()
  replacement.set('fullName', 'Test User')
  replacement.set('phone', '')
  replacement.set('profileImage', new Blob([png], { type: 'image/png' }), 'replacement.png')
  const replacementResponse = await fetch(`${baseUrl}/api/users/profile`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}` },
    body: replacement,
  })
  assert.equal(replacementResponse.status, 200)
  const replaced = await replacementResponse.json()
  assert.notEqual(replaced.user.profile_image, uploaded.user.profile_image)
  assert.equal((await fetch(`${baseUrl}${uploaded.user.profile_image}`)).status, 404)

  const removalResponse = await fetch(`${baseUrl}/api/users/profile/image?userId=99`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
  assert.equal(removalResponse.status, 200)
  assert.equal((await removalResponse.json()).user.profile_image, null)
  assert.deepEqual(updates, [user.id, user.id, user.id])

  const removedImage = await fetch(`${baseUrl}${replaced.user.profile_image}`)
  assert.equal(removedImage.status, 404)
})
