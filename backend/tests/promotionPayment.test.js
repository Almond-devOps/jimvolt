const assert = require('node:assert/strict')
const test = require('node:test')
const { pool } = require('../config/database')
const promotionModel = require('../models/promotionModel')
const bachsService = require('../services/bachsService')
const promotionController = require('../controllers/promotionController')

function response() {
  return {
    statusCode: 200,
    status(code) { this.statusCode = code; return this },
    json(body) { this.body = body; return this },
  }
}

async function withStubs(target, stubs, callback) {
  const originals = Object.fromEntries(
    Object.keys(stubs).map((key) => [key, target[key]]),
  )
  Object.assign(target, stubs)
  try {
    await callback()
  } finally {
    Object.assign(target, originals)
  }
}

test('checkout verification compares the authoritative Bachs session to stored order values', () => {
  const payment = {
    amount: '2000.00',
    currency: 'NGN',
    provider_reference: 'promotion-reference',
    provider_checkout_id: 'chk_promotion',
  }
  const checkout = {
    amount: '2000',
    currency: 'NGN',
    reference: 'promotion-reference',
    checkout_id: 'chk_promotion',
    payment_status: 'paid',
  }

  assert.equal(promotionModel.checkoutMatchesPayment(payment, checkout), true)
  assert.equal(promotionModel.checkoutMatchesPayment(payment, { ...checkout, amount: '2000.01' }), false)
  assert.equal(promotionModel.checkoutMatchesPayment(payment, { ...checkout, currency: 'USD' }), false)
  assert.equal(promotionModel.checkoutMatchesPayment(payment, { ...checkout, reference: 'another-order' }), false)
  assert.equal(promotionModel.checkoutMatchesPayment(payment, { ...checkout, payment_status: 'pending' }), false)
})

test('Bachs checkout amounts retain exact decimal precision', () => {
  assert.equal(bachsService.formatAmount('2000'), '2000.00')
  assert.equal(bachsService.formatAmount('5000.25'), '5000.25')
  assert.throws(() => bachsService.formatAmount('5000.257'), { statusCode: 500 })
})

test('promotion initialization creates a Bachs checkout for an owned advertisement and saves its session', async () => {
  const originalKey = process.env.BACHS_API_KEY
  process.env.BACHS_API_KEY = 'sk_sandbox_promotion-test'
  const calls = {}
  try {
    await withStubs(promotionModel, {
    createPendingPromotion: async (input) => {
      calls.pending = input
      return {
        id: 12,
        paymentId: 31,
        advertisement: { id: input.advertisementId, title: 'Solar panel' },
        package: { id: input.packageId, price: '2000.00' },
      }
    },
    saveCheckoutSession: async (reference, checkout) => { calls.saved = { reference, checkout } },
  }, async () => withStubs(bachsService, {
    createPromotionCheckout: async (input) => {
      calls.checkout = input
      return {
        checkout_id: 'chk_promotion',
        checkout_url: 'https://checkout.bachs.io/c/example',
        reference: input.reference,
        expires_at: '2026-06-01T10:00:00Z',
      }
    },
  }, async () => {
    const res = response()
    await promotionController.initialize({
      body: { advertisementId: 7, packageId: 3 },
      user: { id: 42 },
    }, res)

    assert.equal(res.statusCode, 201)
    assert.equal(calls.pending.userId, 42)
    assert.equal(calls.pending.advertisementId, 7)
    assert.equal(calls.pending.packageId, 3)
    assert.equal(calls.checkout.amount, '2000.00')
    assert.equal(calls.checkout.promotionId, 12)
    assert.match(calls.checkout.successUrl, /\/dashboard\/promotions\?payment_reference=/)
    assert.equal(calls.saved.checkout.checkout_id, 'chk_promotion')
    assert.equal(res.body.authorizationUrl, 'https://checkout.bachs.io/c/example')
    }))
  } finally {
    if (originalKey === undefined) delete process.env.BACHS_API_KEY
    else process.env.BACHS_API_KEY = originalKey
  }
})

test('promotion verification is owner-scoped and fulfils only a paid Bachs checkout', async () => {
  const calls = {}
  await withStubs(promotionModel, {
    getPaymentByReference: async (reference, userId) => {
      calls.lookup = { reference, userId }
      return {
        payment_status: 'pending',
        provider_checkout_id: 'chk_promotion',
        promotion_id: 12,
      }
    },
    completeVerifiedPayment: async (checkoutId, checkout) => {
      calls.complete = { checkoutId, checkout }
      return { alreadyProcessed: false, promotionId: 12, status: 'active' }
    },
  }, async () => withStubs(bachsService, {
    getCheckout: async (checkoutId) => {
      calls.checkoutId = checkoutId
      return { checkout_id: checkoutId, payment_status: 'paid' }
    },
  }, async () => {
    const res = response()
    await promotionController.verify({
      params: { reference: 'promotion-reference' },
      user: { id: 91 },
    }, res)

    assert.deepEqual(calls.lookup, { reference: 'promotion-reference', userId: 91 })
    assert.equal(calls.checkoutId, 'chk_promotion')
    assert.equal(calls.complete.checkoutId, 'chk_promotion')
    assert.equal(res.body.status, 'succeeded')
    assert.equal(res.body.promotionStatus, 'active')
  }))
})

test('duplicate Bachs webhook event IDs do not apply a promotion twice', async () => {
  const originalGetConnection = pool.getConnection
  const eventIds = new Set()
  const writes = []
  const payment = {
    payment_id: 31,
    amount: '2000.00',
    currency: 'NGN',
    payment_status: 'pending',
    provider_reference: 'promotion-reference',
    provider_checkout_id: 'chk_promotion',
    promotion_id: 12,
    promotion_status: 'pending_payment',
    duration_days: 3,
    advertisement_id: 7,
    advertisement_status: 'approved',
  }
  pool.getConnection = async () => ({
    beginTransaction: async () => {},
    execute: async (query, values) => {
      if (query.includes('SELECT p.id AS payment_id')) return [[{ ...payment }]]
      if (query.includes('INSERT IGNORE INTO bachs_webhook_events')) {
        if (eventIds.has(values[0])) return [{ affectedRows: 0 }]
        eventIds.add(values[0])
        return [{ affectedRows: 1 }]
      }
      if (query.includes('UPDATE payment_transactions')) {
        writes.push('payment')
        payment.payment_status = 'succeeded'
        return [{ affectedRows: 1 }]
      }
      if (query.includes('UPDATE promotions')) {
        writes.push('promotion')
        payment.promotion_status = values[0]
        return [{ affectedRows: 1 }]
      }
      throw new Error(`Unexpected SQL in promotion webhook test: ${query}`)
    },
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
  })

  try {
    const checkout = {
      checkout_id: 'chk_promotion',
      reference: 'promotion-reference',
      amount: '2000.00',
      currency: 'NGN',
      payment_status: 'paid',
      charge: { payment_id: 'pay_123' },
    }
    const event = { id: 'evt_promotion', type: 'checkout.completed' }
    const first = await promotionModel.completeVerifiedPayment('chk_promotion', checkout, event)
    const duplicate = await promotionModel.completeVerifiedPayment('chk_promotion', checkout, event)

    assert.equal(first.alreadyProcessed, false)
    assert.equal(first.status, 'active')
    assert.equal(duplicate.alreadyProcessed, true)
    assert.deepEqual(writes, ['payment', 'promotion'])
  } finally {
    pool.getConnection = originalGetConnection
  }
})

test('a seller cannot start a promotion for another seller advertisement', async () => {
  const originalGetConnection = pool.getConnection
  let advertisementLookup
  let rolledBack = false
  pool.getConnection = async () => ({
    beginTransaction: async () => {},
    execute: async (query, values) => {
      if (query.includes('FROM promotion_packages')) {
        return [[{ id: 3, name: 'Boost', price: '2000.00', duration_days: 3 }]]
      }
      if (query.includes('FROM advertisements')) {
        advertisementLookup = values
        return [[]]
      }
      throw new Error(`Unexpected SQL in promotion ownership test: ${query}`)
    },
    commit: async () => {},
    rollback: async () => { rolledBack = true },
    release: () => {},
  })

  try {
    await assert.rejects(
      promotionModel.createPendingPromotion({
        userId: 42,
        advertisementId: 7,
        packageId: 3,
        reference: 'promotion-reference',
      }),
      { statusCode: 404, message: 'Advertisement not found.' },
    )
    assert.deepEqual(advertisementLookup, [7, 42])
    assert.equal(rolledBack, true)
  } finally {
    pool.getConnection = originalGetConnection
  }
})

test('Bachs webhook controller verifies and reconciles successful checkout events', async () => {
  const event = {
    id: 'evt_promotion',
    type: 'checkout.completed',
    data: { checkout_id: 'chk_promotion', payment_status: 'paid' },
  }
  const calls = []
  await withStubs(bachsService, {
    constructEvent: (rawBody, headers) => {
      assert.equal(rawBody.toString(), 'raw-json')
      assert.equal(headers['x-bachs-signature'], 'signature')
      return event
    },
    getCheckout: async (checkoutId) => {
      calls.push(['getCheckout', checkoutId])
      return { checkout_id: checkoutId, payment_status: 'paid' }
    },
  }, async () => withStubs(promotionModel, {
    getPaymentByCheckoutId: async (checkoutId) => {
      calls.push(['findPayment', checkoutId])
      return { payment_id: 31 }
    },
    completeVerifiedPayment: async (checkoutId, checkout, receivedEvent) => {
      calls.push(['complete', checkoutId, receivedEvent.id])
      assert.equal(checkout.payment_status, 'paid')
    },
  }, async () => {
    const res = response()
    await promotionController.webhook({
      rawBody: Buffer.from('raw-json'),
      headers: { 'x-bachs-signature': 'signature' },
    }, res)
    assert.deepEqual(calls, [
      ['findPayment', 'chk_promotion'],
      ['getCheckout', 'chk_promotion'],
      ['complete', 'chk_promotion', 'evt_promotion'],
    ])
    assert.deepEqual(res.body, { received: true })
  }))
})

test('Bachs payment-attempt failures do not cancel an open checkout', async () => {
  const event = {
    id: 'evt_failed_attempt',
    type: 'collection.failed',
    data: { checkout_id: 'chk_promotion' },
  }
  let failedPayment = false
  await withStubs(bachsService, {
    constructEvent: () => event,
  }, async () => withStubs(promotionModel, {
    failPendingPaymentByCheckoutId: async () => { failedPayment = true },
  }, async () => {
    const res = response()
    await promotionController.webhook({
      rawBody: Buffer.from('raw-json'),
      headers: {},
    }, res)
    assert.equal(failedPayment, false)
    assert.deepEqual(res.body, { received: true })
  }))
})
