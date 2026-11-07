function isValidMessageAttachment(attachment, userId, cloudName) {
  if (!attachment || typeof attachment.url !== 'string' || typeof attachment.publicId !== 'string') return false
  if (!/^\d+$/.test(String(userId)) || !/^[a-z0-9-]+$/i.test(cloudName || '')) return false

  let url
  try { url = new URL(attachment.url) } catch { return false }
  const expectedPublicId = new RegExp(`^user_${userId}/[0-9a-f-]{36}$`)
  return url.protocol === 'https:'
    && url.hostname === 'res.cloudinary.com'
    && url.pathname.includes(`/${cloudName}/image/upload/`)
    && url.pathname.includes(`/jimvolt/messages/${attachment.publicId}`)
    && expectedPublicId.test(attachment.publicId)
    && attachment.publicId.length <= 255
}

module.exports = { isValidMessageAttachment }
