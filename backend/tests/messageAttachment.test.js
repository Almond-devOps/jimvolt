const test = require('node:test')
const assert = require('node:assert/strict')
const { detectImageType } = require('../utils/detectImageType')
const { isValidMessageAttachment } = require('../utils/messageAttachment')

test('accepts only Cloudinary image URLs owned by the authenticated user', () => {
  const publicId = 'user_42/123e4567-e89b-12d3-a456-426614174000'
  const attachment = {
    publicId,
    url: 'https://res.cloudinary.com/jimvolt-test/image/upload/v123/jimvolt/messages/user_42/123e4567-e89b-12d3-a456-426614174000.jpg',
  }
  assert.equal(isValidMessageAttachment(attachment, 42, 'jimvolt-test'), true)
  assert.equal(isValidMessageAttachment(attachment, 43, 'jimvolt-test'), false)
  assert.equal(isValidMessageAttachment({ ...attachment, url: attachment.url.replace('https:', 'http:') }, 42, 'jimvolt-test'), false)
  assert.equal(isValidMessageAttachment({ ...attachment, url: attachment.url.replace('res.cloudinary.com', 'attacker.example') }, 42, 'jimvolt-test'), false)
})

test('detects supported image types from file signatures instead of trusting MIME metadata', () => {
  assert.equal(detectImageType(Buffer.from([0xff, 0xd8, 0xff, 0x00])), 'image/jpeg')
  assert.equal(detectImageType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), 'image/png')
  assert.equal(detectImageType(Buffer.from('GIF89a')), 'image/gif')
  assert.equal(detectImageType(Buffer.from('RIFF0000WEBP')), 'image/webp')
  assert.equal(detectImageType(Buffer.from('<svg></svg>')), null)
})
