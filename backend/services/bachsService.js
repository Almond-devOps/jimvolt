const { Bachs, webhooks } = require('@bachs/sdk')

function makeError(message, statusCode = 503) {
  const error = new Error(message)
  error.statusCode = statusCode
  return error
}

function getClient() {
  const apiKey = process.env.BACHS_API_KEY
  if (!apiKey) throw makeError('Promotion checkout is temporarily unavailable. Please try again later.')
  return new Bachs({ apiKey })
}

function formatAmount(amount) {
  const value = String(amount)
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(value)) {
    throw makeError('The promotion package has an invalid price.', 500)
  }
  const [whole, fraction = ''] = value.split('.')
  return `${whole}.${fraction.padEnd(2, '0')}`
}

async function createPromotionCheckout({ amount, reference, promotionId, successUrl, cancelUrl }) {
  const checkout = await getClient().checkoutSessions.create({
    pricing: { currency: 'NGN', amount: formatAmount(amount), price_type: 'fixed' },
    reference,
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      payment_type: 'promotion',
      payment_reference: reference,
      promotion_id: String(promotionId),
    },
  }, { idempotencyKey: `promotion-${reference}` })

  const checkoutUrl = new URL(checkout.checkout_url)
  if (checkoutUrl.protocol !== 'https:' || checkoutUrl.hostname !== 'checkout.bachs.io') {
    throw makeError('Bachs returned an invalid checkout URL.', 502)
  }
  if (!checkout.checkout_id || checkout.reference !== reference) {
    throw makeError('Bachs returned an incomplete checkout response.', 502)
  }
  return checkout
}

async function getCheckout(checkoutId) {
  return getClient().checkoutSessions.get(checkoutId)
}

function constructEvent(rawBody, headers) {
  const secret = process.env.BACHS_WEBHOOK_SECRET
  if (!secret) throw makeError('Bachs webhook verification is not configured.')
  if (!rawBody) throw makeError('Bachs webhook payload is missing.', 400)
  return webhooks.constructEvent(rawBody, headers, secret)
}

module.exports = { constructEvent, createPromotionCheckout, formatAmount, getCheckout }
