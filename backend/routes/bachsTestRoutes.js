const express = require('express')
const { randomUUID } = require('node:crypto')
const { body, validationResult } = require('express-validator')
const { Bachs } = require('@bachs/sdk')
const { asyncHandler } = require('../middleware/errorMiddleware')

const router = express.Router()

router.post(
  '/checkout',
  body('amount')
    .isString()
    .trim()
    .matches(/^(?:0|[1-9]\d{0,8})(?:\.\d{1,2})?$/)
    .withMessage('Enter a Naira amount with no more than two decimal places.')
    .custom((amount) => Number(amount) > 0)
    .withMessage('Amount must be greater than zero.'),
  asyncHandler(async (req, res) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: errors.array()[0].msg })
    }

    const apiKey = process.env.BACHS_API_KEY
    if (!apiKey || !apiKey.startsWith('sk_sandbox_')) {
      return res.status(503).json({
        message: 'Configure a Bachs sandbox API key (sk_sandbox_...) to create test checkouts.',
      })
    }

    const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:5173').split(',')[0].trim()
    const bachs = new Bachs({ apiKey })
    const checkout = await bachs.checkoutSessions.create({
      pricing: { currency: 'NGN', amount: req.body.amount, price_type: 'fixed' },
      success_url: new URL('/tests/bachs?status=returned', frontendUrl).toString(),
      cancel_url: new URL('/tests/bachs?status=cancelled', frontendUrl).toString(),
    }, { idempotencyKey: randomUUID() })

    const checkoutUrl = new URL(checkout.checkout_url)
    if (checkoutUrl.protocol !== 'https:') {
      throw new Error('Bachs returned an invalid checkout URL.')
    }

    return res.json({ checkoutUrl: checkoutUrl.toString() })
  }),
)

module.exports = router
