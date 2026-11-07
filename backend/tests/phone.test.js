const test = require('node:test')
const assert = require('node:assert/strict')
const { isValidNigerianPhone, normalizeNigerianPhone } = require('../utils/phone')

test('normalizes Nigerian mobile numbers in common formats', () => {
  assert.equal(normalizeNigerianPhone('08031234567'), '+2348031234567')
  assert.equal(normalizeNigerianPhone('8031234567'), '+2348031234567')
  assert.equal(normalizeNigerianPhone('+234 803 123 4567'), '+2348031234567')
})

test('validates Nigerian mobile numbers and rejects invalid values', () => {
  assert.equal(isValidNigerianPhone('08031234567'), true)
  assert.equal(isValidNigerianPhone('07031234567'), true)
  assert.equal(isValidNigerianPhone('9012345678'), true)
  assert.equal(isValidNigerianPhone('12345'), false)
  assert.equal(isValidNigerianPhone('0803123456'), false)
})
