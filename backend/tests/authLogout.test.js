const assert = require('node:assert/strict')
const test = require('node:test')
const authController = require('../controllers/authController')
const userModel = require('../models/userModel')

test('logout invalidates only the authenticated user tokens and disconnects their sockets', async () => {
  const originalInvalidateTokens = userModel.invalidateTokens
  const invalidatedUsers = []
  const disconnectedRooms = []
  let response

  userModel.invalidateTokens = async (userId) => invalidatedUsers.push(userId)
  const io = {
    in(room) {
      return {
        disconnectSockets(force) {
          disconnectedRooms.push({ room, force })
        },
      }
    },
  }

  try {
    await authController.logout(
      { user: { id: 42 }, app: { get: () => io } },
      { json: (body) => { response = body; return body } },
    )
  } finally {
    userModel.invalidateTokens = originalInvalidateTokens
  }

  assert.deepEqual(invalidatedUsers, [42])
  assert.deepEqual(disconnectedRooms, [{ room: 'user:42', force: true }])
  assert.deepEqual(response, { message: 'You have been logged out.' })
})