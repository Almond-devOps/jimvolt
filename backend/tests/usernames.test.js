const assert = require('node:assert/strict')
const test = require('node:test')
const { isReservedUsername, suggestUsername, validateUsername } = require('../utils/slugUtils')

test('reserved names cover app routes and impersonation handles', () => {
  for (const name of ['admin', 'login', 'dashboard', 'jimvolt', 'support', 'official', 'settings', 'api']) {
    assert.equal(isReservedUsername(name), true, name)
    assert.match(validateUsername(name), /reserved/, name)
  }
  assert.equal(isReservedUsername('me'), true)
})

test('ordinary usernames pass validation', () => {
  assert.equal(validateUsername('ada-lovelace'), null)
  assert.equal(validateUsername('solar9'), null)
})

test('invalid usernames are rejected with a reason', () => {
  assert.match(validateUsername('ab'), /at least 3/)
  assert.match(validateUsername('-ada'), /start or end/)
  assert.match(validateUsername('ada--lovelace'), /consecutive/)
})

test('suggestions come from the name and never land on a reserved word', () => {
  assert.equal(suggestUsername('Ada Lovelace'), 'ada-lovelace')
  assert.equal(suggestUsername('  Chinwe  O.  '), 'chinwe-o')
  assert.equal(suggestUsername('!!'), 'member')
  assert.equal(suggestUsername('Admin'), 'member')
})
