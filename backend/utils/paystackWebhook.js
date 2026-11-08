const crypto = require('node:crypto')

function verifyPaystackSignature(rawBody, signature, secret) {
  if (!Buffer.isBuffer(rawBody) || typeof signature !== 'string' || !secret || !/^[a-f0-9]{128}$/i.test(signature)) {
    return false
  }
  const expected = crypto.createHmac('sha512', secret).update(rawBody).digest()
  const received = Buffer.from(signature, 'hex')
  return received.length === expected.length && crypto.timingSafeEqual(received, expected)
}

module.exports = { verifyPaystackSignature }