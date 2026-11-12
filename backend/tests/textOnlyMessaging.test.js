const assert = require('node:assert/strict')
const http = require('node:http')
const test = require('node:test')
const express = require('express')
const jwt = require('jsonwebtoken')
const userModel = require('../models/userModel')
const messageModel = require('../models/messageModel')
const adModel = require('../models/adModel')
const routes = require('../routes/messageRoutes')
const { errorHandler } = require('../middleware/errorMiddleware')

test('messaging routes accept text, reject attachments and preserve historical images', async (t) => {
  const originals = []
  const stub = (object, key, replacement) => {
    const original = object[key]
    originals.push(() => { object[key] = original })
    object[key] = replacement
  }
  const secret = process.env.JWT_SECRET
  process.env.JWT_SECRET = 'local-text-only-messaging-test-secret'
  let writes = 0
  let resultMode = 'ok'
  stub(userModel, 'findById', async () => ({ id: 42, account_status: 'active', token_version: 0 }))
  stub(adModel, 'findPublicById', async () => ({ id: 9, seller: { id: 7 } }))
  stub(messageModel, 'createOrGetConversation', async () => 12)
  stub(messageModel, 'sendMessage', async (payload) => {
    writes++
    assert.equal(Object.hasOwn(payload, 'attachments'), false)
    assert.equal(payload.message, 'hello')
    if (resultMode === 'missing') return null
    if (resultMode === 'forbidden') return false
    return { messages: [{ id: 1, message_type: 'text', message_content: payload.message }], receiverId: 7 }
  })
  const historical = { messages: [{ id: 2, message_type: 'image', attachment_url: 'https://example.com/old.jpg' }], hasMore: false }
  stub(messageModel, 'listMessages', async () => historical)
  const app = express()
  app.use(express.json())
  app.use('/api/messages', routes)
  app.use(errorHandler)
  const server = http.createServer(app)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  t.after(async () => {
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
    originals.reverse().forEach((restore) => restore())
    if (secret === undefined) delete process.env.JWT_SECRET
    else process.env.JWT_SECRET = secret
  })
  const base = `http://127.0.0.1:${server.address().port}/api/messages`
  const token = jwt.sign({ sub: '42', tokenVersion: 0 }, process.env.JWT_SECRET)
  const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' }
  const post = (path, body, authenticated = true) => fetch(base + path, {
    method: 'POST', headers: authenticated ? headers : { 'content-type': 'application/json' }, body: JSON.stringify(body),
  })
  const sendPath = '/conversations/12/messages'
  assert.equal((await post(sendPath, { message: 'hello' }, false)).status, 401)
  for (const path of ['', sendPath]) {
    assert.equal((await post(path, { advertisementId: 9, message: '  hello  ' })).status, 201)
    for (const extra of [
      { attachments: [] }, { attachments: [{ url: 'https://example.com/new.jpg' }] },
      { attachment_url: 'https://example.com/new.jpg' }, { message_type: 'image' },
      { messageType: 'image' }, { image: 'anything' }, { files: [] },
    ]) {
      const before = writes
      const response = await post(path, { advertisementId: 9, message: 'hello', ...extra })
      assert.equal(response.status, 400)
      assert.match((await response.json()).message, /no longer supported/)
      assert.equal(writes, before)
    }
  }
  for (const message of ['', '   ', 'x'.repeat(2001), 12]) {
    const before = writes
    assert.equal((await post(sendPath, { message })).status, 400)
    assert.equal(writes, before)
  }
  resultMode = 'missing'
  assert.equal((await post(sendPath, { message: 'hello' })).status, 404)
  resultMode = 'forbidden'
  assert.equal((await post(sendPath, { message: 'hello' })).status, 403)
  assert.equal((await post('/uploads', {}, false)).status, 401)
  const retired = await fetch(base + '/uploads', {
    method: 'POST', headers: { authorization: headers.authorization, 'content-type': 'multipart/form-data; boundary=unused' },
    body: 'not parsed or stored',
  })
  assert.equal(retired.status, 410)
  const history = await fetch(base + sendPath, { headers })
  assert.equal(history.status, 200)
  assert.deepEqual(await history.json(), historical)
})
