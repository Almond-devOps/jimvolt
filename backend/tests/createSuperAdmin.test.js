const test = require('node:test')
const assert = require('node:assert/strict')
const { validateInput } = require('../scripts/createSuperAdmin')

const validInput = {
  fullName: 'Ada Example',
  email: 'ADA@example.com',
  phone: '08031234567',
  password: 'a-strong-password-123',
  passwordConfirmation: 'a-strong-password-123',
}

test('validates and normalizes super-admin account details', () => {
  assert.deepEqual(validateInput(validInput), {
    fullName: 'Ada Example',
    email: 'ada@example.com',
    phone: '+2348031234567',
  })
})

test('rejects invalid email, phone, and mismatched or weak passwords', () => {
  assert.throws(() => validateInput({ ...validInput, email: 'not-an-email' }), /valid email/)
  assert.throws(() => validateInput({ ...validInput, phone: '12345' }), /Nigerian mobile/)
  assert.throws(() => validateInput({ ...validInput, password: 'short' }), /12 characters/)
  assert.throws(() => validateInput({
    ...validInput,
    passwordConfirmation: 'a-different-password',
  }), /do not match/)
})
