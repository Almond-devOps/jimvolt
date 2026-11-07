const test = require('node:test')
const assert = require('node:assert/strict')
const { tokenVersionMatches } = require('../utils/tokenVersion')

test('accepts existing tokens for users at the initial token version', () => {
  assert.equal(tokenVersionMatches(undefined, 0), true)
  assert.equal(tokenVersionMatches(0, 0), true)
})

test('rejects a token after the user token version is incremented', () => {
  assert.equal(tokenVersionMatches(0, 1), false)
  assert.equal(tokenVersionMatches(2, 2), true)
})
