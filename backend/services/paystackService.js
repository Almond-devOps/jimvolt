function serviceError(message, statusCode) {
  const error = new Error(message)
  error.statusCode = statusCode
  return error
}

function toKobo(amount) {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(String(amount))
  if (!match) throw serviceError('Payment amounts must use up to two decimal places.', 400)
  const value = BigInt(match[1]) * 100n + BigInt((match[2] || '').padEnd(2, '0') || '0')
  if (value <= 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw serviceError('Payment amount is outside the supported range.', 400)
  }
  return Number(value)
}

function secretKey() {
  if (!process.env.PAYSTACK_SECRET_KEY) {
    throw serviceError('Online payments are not configured.', 503)
  }
  return process.env.PAYSTACK_SECRET_KEY
}

async function requestPaystack(path, options = {}) {
  let response
  try {
    response = await fetch(`https://api.paystack.co${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${secretKey()}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
      signal: AbortSignal.timeout(12000),
    })
  } catch {
    throw serviceError('The payment provider is temporarily unavailable.', 503)
  }

  const result = await response.json().catch(() => null)
  if (!response.ok || result?.status !== true || !result.data) {
    throw serviceError('The payment provider could not process the request.', 502)
  }
  return result.data
}

async function initializeTransaction({ email, reference, amount, callbackUrl, metadata }) {
  return requestPaystack('/transaction/initialize', {
    method: 'POST',
    body: JSON.stringify({
      email,
      reference,
      amount: toKobo(amount),
      currency: 'NGN',
      callback_url: callbackUrl,
      metadata,
    }),
  })
}

async function verifyTransaction(reference) {
  return requestPaystack(`/transaction/verify/${encodeURIComponent(reference)}`, { method: 'GET' })
}

module.exports = { initializeTransaction, toKobo, verifyTransaction }