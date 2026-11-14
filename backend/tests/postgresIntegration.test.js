// End-to-end check of the real SQL against a live PostgreSQL database. It is skipped unless
// JIMVOLT_TEST_POSTGRES=1, because it needs a throwaway database (DB_HOST, DB_PORT, DB_USER,
// DB_PASSWORD, DB_NAME). It creates the schema and rows in whatever database you point it at.
const assert = require('node:assert/strict')
const http = require('node:http')
const test = require('node:test')

const enabled = process.env.JIMVOLT_TEST_POSTGRES === '1'

test('Jimvolt API runs on PostgreSQL', { skip: !enabled && 'set JIMVOLT_TEST_POSTGRES=1 and DB_* to run' }, async (t) => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'integration-test-secret-integration-test-secret'
  const jwt = require('jsonwebtoken')
  const { app } = require('../server')
  const { pool } = require('../config/database')

  const server = http.createServer(app)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  // Rows created here are marked by a password that is not a real hash, so they can be removed
  // (cascading to their ads, messages and ratings) before and after every run.
  const testUsers = "SELECT id FROM users WHERE password = 'x' AND email LIKE '%@example.com'"
  const removeTestRows = async () => {
    // Payments and promotions are ON DELETE RESTRICT, so they go first.
    await pool.execute(`DELETE FROM promotions WHERE user_id IN (${testUsers})`)
    await pool.execute(`DELETE FROM payment_transactions WHERE user_id IN (${testUsers})`)
    await pool.execute("DELETE FROM bachs_webhook_events WHERE event_id LIKE 'evt_%'")
    await pool.execute(`DELETE FROM seller_slug_history WHERE user_id IN (${testUsers})`)
    await pool.execute("DELETE FROM users WHERE password = 'x' AND email LIKE '%@example.com'")
  }
  t.after(async () => {
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
    await removeTestRows().catch(() => {})
    await pool.end()
  })

  // The first request runs startup (connect + schema + categories). Wait for it before touching
  // any table, so this also works on a brand-new, empty database.
  const health = await fetch(`${base}/api/health`)
  assert.equal(health.status, 200)
  await removeTestRows()

  const suffix = Date.now()
  const insertUser = async (name, role = 'user') => {
    const [result] = await pool.execute(
      `INSERT INTO users (full_name, email, phone, password, role, is_verified)
       VALUES (?, ?, ?, 'x', ?, ?)`,
      [name, `${name.toLowerCase().replace(/\W+/g, '')}${suffix}@example.com`, `080${String(suffix).slice(-8)}${role.length}${name.length}`, role, role === 'user'],
    )
    return result.insertId
  }
  const sellerId = await insertUser('Seller One')
  const buyerId = await insertUser('Buyer Two')
  const adminId = await insertUser('Admin Three', 'super_admin')
  assert.ok(sellerId > 0 && buyerId > 0 && adminId > 0, 'INSERT must return insertId')

  const token = (id) => jwt.sign({ sub: id, tokenVersion: 0 }, process.env.JWT_SECRET, { expiresIn: '1h' })
  const call = async (method, path, { as, body } = {}) => {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: { ...(as ? { authorization: `Bearer ${token(as)}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    })
    const text = await response.text()
    let json
    try { json = JSON.parse(text) } catch { json = text }
    return { status: response.status, body: json }
  }
  const ok = async (method, path, options) => {
    const result = await call(method, path, options)
    assert.ok(result.status < 400, `${method} ${path} -> ${result.status} ${JSON.stringify(result.body).slice(0, 300)}`)
    return result.body
  }

  const [[category]] = await pool.execute("SELECT id, slug FROM categories WHERE slug = 'solar-panels'")
  const [adResult] = await pool.execute(
    `INSERT INTO advertisements (user_id, category_id, title, brand, specifications, slug, description, price, condition_type, state, city, phone, status, approved_at)
     VALUES (?, ?, 'Monocrystalline Solar Panel 400W', 'Jinko', '400W 24V', ?, 'Brand new panels for your roof', 150000.50, 'new', 'Lagos', 'Ikeja', '08012345678', 'approved', CURRENT_TIMESTAMP)`,
    [sellerId, category.id, `panel-${suffix}`],
  )
  const adId = adResult.insertId
  await pool.execute('INSERT INTO product_images (advertisement_id, image_url) VALUES (?, ?)', [adId, '/uploads/products/a.jpg'])

  await t.test('public listing, search and discovery queries', async () => {
    const list = await ok('GET', '/api/ads/search')
    assert.equal(list.advertisements.length, 1)
    assert.equal(list.advertisements[0].title, 'Monocrystalline Solar Panel 400W')
    assert.equal(list.advertisements[0].price, '150000.50')
    assert.deepEqual(list.advertisements[0].seller.rating, { average: null, count: 0 })
    assert.equal(list.totalResults, 1)

    for (const query of [
      '?q=solar', '?q=sol%20pan', '?q=JINKO', '?q=nomatchatall', '?category=solar-panels', '?state=lagos&city=IKEJA',
      '?condition=new&minPrice=1000&maxPrice=999999', '?verified=true', '?featured=true', '?featured=false',
      '?recently=true', '?sort=random&seed=42', '?sort=popular', '?sort=price_asc', '?sort=most_viewed', '?page=1&limit=5',
    ]) {
      await ok('GET', `/api/ads/search${query}`)
    }
    const found = await ok('GET', '/api/ads/search?q=sol%20pan')
    assert.equal(found.advertisements.length, 1, 'prefix full-text search must find the listing')
    assert.equal((await ok('GET', '/api/ads/search?q=nomatchatall')).advertisements.length, 0)

    assert.equal((await ok('GET', '/api/ads/search/suggestions?q=solar')).suggestions.length, 1)
    assert.equal((await ok('GET', '/api/ads/locations/popular')).locations[0].name, 'Lagos')
    assert.ok((await ok('GET', '/api/ads/locations/cities?state=Lagos')).cities.includes('Ikeja'))
    const detail = await ok('GET', `/api/ads/${adId}`)
    assert.equal(detail.advertisement.views, 1)
    await ok('GET', `/api/ads/${adId}/price-history`)
    await ok('GET', '/api/categories')
    await ok('GET', '/api/categories/solar-panels')
    await ok('GET', '/api/payments/packages')
    await ok('GET', '/api/payments/featured')
    await ok('GET', '/api/users/sellers')
    await ok('GET', `/api/ads/sellers/${sellerId}`)
  })

  await t.test('seller ratings upsert', async () => {
    await ok('PUT', `/api/ads/sellers/${sellerId}/ratings`, { as: buyerId, body: { score: 4 } })
    const second = await ok('PUT', `/api/ads/sellers/${sellerId}/ratings`, { as: buyerId, body: { score: 5 } })
    assert.equal(second.count, 1)
    assert.equal(second.average, 5)
    const list = await ok('GET', '/api/ads/search')
    assert.deepEqual(list.advertisements[0].seller.rating, { average: 5, count: 1 })
  })

  await t.test('favourites and recently viewed', async () => {
    await ok('POST', `/api/favorites/${adId}`, { as: buyerId })
    await ok('POST', `/api/favorites/${adId}`, { as: buyerId })
    assert.equal((await ok('GET', '/api/favorites/count', { as: buyerId })).count, 1)
    await ok('GET', '/api/favorites', { as: buyerId })
    await ok('GET', '/api/favorites?q=solar', { as: buyerId })
    await ok('GET', '/api/favorites/preferences', { as: buyerId })
    await ok('PUT', '/api/favorites/preferences', { as: buyerId, body: { notifyPriceDrops: false } })
    assert.equal((await ok('GET', '/api/favorites/preferences', { as: buyerId })).notifyPriceDrops, false)
    await ok('GET', `/api/ads/${adId}`, { as: buyerId })
    await ok('GET', `/api/ads/${adId}`, { as: buyerId })
    await ok('GET', '/api/recently-viewed', { as: buyerId })
    await ok('GET', '/api/users/favourites', { as: buyerId })
    await ok('DELETE', `/api/favorites/${adId}`, { as: buyerId })
  })

  await t.test('messaging', async () => {
    const created = await ok('POST', '/api/messages/conversations', { as: buyerId, body: { advertisementId: adId } })
    const conversationId = created.conversation?.id ?? created.id
    assert.ok(conversationId, JSON.stringify(created))
    await ok('POST', '/api/messages', { as: buyerId, body: { advertisementId: adId, message: 'Is this still available?' } })
    await ok('GET', '/api/messages/conversations', { as: sellerId })
    await ok('GET', '/api/messages/conversations?q=solar', { as: sellerId })
    await ok('GET', `/api/messages/conversations/${conversationId}`, { as: sellerId })
    await ok('PUT', `/api/messages/conversations/${conversationId}/read`, { as: sellerId })
    await ok('GET', '/api/messages', { as: sellerId })
    const sent = await ok('POST', `/api/messages/conversations/${conversationId}/messages`, { as: sellerId, body: { message: 'Yes, it is available.' } })
    const sentMessage = sent.messages[0]
    await ok('GET', `/api/messages/conversations/${conversationId}/messages`, { as: buyerId })
    await ok('GET', `/api/messages/conversations/${conversationId}/messages?limit=1&beforeId=999999`, { as: buyerId })
    await ok('PUT', `/api/messages/${sentMessage.id}/read`, { as: buyerId })
    await ok('PUT', `/api/messages/conversations/${conversationId}/archive`, { as: buyerId, body: { archived: true } })
    await ok('GET', '/api/messages/conversations', { as: buyerId })
    await ok('PUT', `/api/messages/conversations/${conversationId}/archive`, { as: buyerId, body: { archived: false } })
    await ok('POST', `/api/messages/conversations/${conversationId}/report`, { as: buyerId, body: { messageId: sentMessage.id, description: 'This message looks abusive to me.' } })
    await ok('DELETE', `/api/messages/conversations/${conversationId}`, { as: buyerId })
  })

  await t.test('seller and user dashboards', async () => {
    await ok('GET', '/api/auth/me', { as: sellerId })
    await ok('GET', '/api/users/profile', { as: sellerId })
    await ok('GET', '/api/users/dashboard', { as: sellerId })
    await ok('GET', '/api/users/my-ads', { as: sellerId })
    await ok('GET', '/api/seller/dashboard', { as: sellerId })
    await ok('GET', '/api/seller/ads', { as: sellerId })
    await ok('GET', '/api/seller/ads?q=solar&status=approved', { as: sellerId })
    await ok('GET', '/api/seller/analytics', { as: sellerId })
    await ok('GET', `/api/seller/analytics/${adId}`, { as: sellerId })
    await ok('GET', '/api/seller/notifications', { as: sellerId })
    await ok('GET', '/api/seller/verification', { as: sellerId })
    await ok('GET', '/api/payments/my-promotions', { as: sellerId })
  })

  await t.test('reports and admin', async () => {
    await ok('POST', '/api/reports', { as: buyerId, body: { advertisementId: adId, category: 'fraud', description: 'This listing looks suspicious to me.' } })
    const again = await call('POST', '/api/reports', { as: buyerId, body: { advertisementId: adId, category: 'fraud', description: 'This listing looks suspicious to me.' } })
    assert.ok(again.status < 500)
    for (const path of [
      '/api/admin/dashboard', '/api/admin/analytics', '/api/admin/ads', '/api/admin/ads?status=approved&q=solar', `/api/admin/ads/${adId}`,
      '/api/admin/users', '/api/admin/users?q=seller', `/api/admin/users/${sellerId}`, '/api/admin/settings/administrators',
      '/api/admin/sellers', '/api/admin/verifications', '/api/admin/verifications/pending', '/api/admin/categories',
      '/api/admin/reports', '/api/admin/reports?status=open&q=solar', '/api/admin/payments', '/api/admin/monetization',
      '/api/admin/monetization?from=2026-01-01&to=2026-12-31', '/api/admin/promotion-packages', '/api/admin/promotions',
      '/api/admin/audit-logs', '/api/admin/audit-logs?q=ad', '/api/admin/advertisements/pending',
    ]) {
      await ok('GET', path, { as: adminId })
    }
    await ok('PUT', `/api/admin/ads/${adId}/feature`, { as: adminId, body: { featured: true } })
    await ok('PUT', `/api/admin/ads/${adId}/suspend`, { as: adminId, body: { reason: 'Policy check for integration test' } })
    await ok('PUT', `/api/admin/ads/${adId}/activate`, { as: adminId })
    const [reports] = await pool.execute('SELECT id FROM reports LIMIT 1')
    await ok('PUT', `/api/admin/reports/${reports[0].id}/resolve`, { as: adminId, body: { notes: 'Checked' } })
  })

  await t.test('ad lifecycle: create, update with price drop, duplicate, delete', async () => {
    const adModel = require('../models/adModel')
    const fields = {
      userId: sellerId, categoryId: category.id, title: 'Hybrid Inverter 5kVA', brand: 'Growatt', specifications: '48V',
      slug: `inverter-${suffix}`, description: 'Pure sine wave hybrid inverter in excellent condition', price: 250000,
      conditionType: 'used', state: 'Abuja', city: 'Wuse', phone: '08098765432', whatsapp: null, images: ['/uploads/products/c.jpg'],
    }
    const newId = await adModel.create(fields)
    assert.ok(newId > 0)
    await pool.execute("UPDATE advertisements SET status = 'approved' WHERE id = ?", [newId])
    await ok('POST', `/api/favorites/${newId}`, { as: buyerId })
    const updated = await adModel.updateOwned(newId, sellerId, { ...fields, price: 200000, images: ['/uploads/products/d.jpg'] })
    assert.ok(updated)
    // Editing sends a listing back to moderation, so approve it again before reading public data.
    await pool.execute("UPDATE advertisements SET status = 'approved' WHERE id = ?", [newId])
    const history = await ok('GET', `/api/ads/${newId}/price-history`)
    assert.ok(JSON.stringify(history).includes('250000'), JSON.stringify(history))
    await ok('GET', '/api/favorites', { as: buyerId })
    await ok('GET', '/api/seller/notifications', { as: buyerId })
    const copy = await ok('POST', `/api/seller/ads/${newId}/duplicate`, { as: sellerId })
    assert.ok(copy)
    await ok('DELETE', `/api/ads/${newId}`, { as: sellerId })
    assert.equal((await call('GET', `/api/ads/${newId}`)).status, 404)
  })

  await t.test('promotion payment: pending -> checkout -> verified -> featured', async () => {
    const promotionModel = require('../models/promotionModel')
    const [[pkg]] = await pool.execute('SELECT id FROM promotion_packages ORDER BY id LIMIT 1')
    const reference = `ref-${suffix}`
    await promotionModel.createPendingPromotion({ userId: sellerId, advertisementId: adId, packageId: pkg.id, reference })
    await promotionModel.saveCheckoutSession(reference, { checkout_id: `co_${suffix}`, expires_at: new Date(Date.now() + 3600e3).toISOString() })
    const payment = await promotionModel.getPaymentByReference(reference, sellerId)
    assert.ok(payment, 'payment must be found by reference')
    const verified = { checkout_id: `co_${suffix}`, reference, payment_status: 'paid', currency: 'NGN', amount: payment.amount }
    const done = await promotionModel.completeVerifiedPayment(`co_${suffix}`, verified, { id: `evt_${suffix}`, type: 'checkout.completed' })
    assert.equal(done.status, 'active')
    const again = await promotionModel.completeVerifiedPayment(`co_${suffix}`, verified, { id: `evt_${suffix}`, type: 'checkout.completed' })
    assert.equal(again.alreadyProcessed, true)

    const featured = await ok('GET', '/api/payments/featured')
    assert.equal(featured.advertisements.length, 1)
    assert.equal(featured.advertisements[0].is_sponsored, true)
    assert.equal(await promotionModel.trackAdvertisement(adId, 'click'), true)
    assert.equal(await promotionModel.trackAdvertisement(adId, 'impression'), true)
    assert.equal((await promotionModel.listForUser(sellerId)).length, 1)
    const promotions = await ok('GET', '/api/admin/promotions', { as: adminId })
    assert.ok(JSON.stringify(promotions).includes('active'))
    const monetization = await ok('GET', '/api/admin/monetization', { as: adminId })
    assert.equal(monetization.stats.revenue, 2000)
    await ok('GET', '/api/admin/monetization?from=2020-01-01&to=2030-01-01', { as: adminId })
    await ok('GET', '/api/admin/payments?status=succeeded', { as: adminId })
    const [[row]] = await pool.execute('SELECT id FROM promotions WHERE payment_id = (SELECT id FROM payment_transactions WHERE provider_reference = ?)', [reference])
    await ok('PATCH', `/api/admin/promotions/${row.id}/status`, { as: adminId, body: { status: 'paused' } })
    await promotionModel.expireDuePromotions()
  })

  await t.test('seller public profile and username', async () => {
    await pool.execute(
      'INSERT INTO seller_profiles (user_id, business_name, slug, public_slug) VALUES (?, ?, ?, ?)',
      [sellerId, 'Seller One Energy', `seller-one-${suffix}`, `seller-one-${suffix}`],
    )
    assert.equal((await ok('GET', `/api/seller/username/check?username=seller${suffix}`, { as: sellerId })).available, true)
    await ok('PUT', '/api/seller/username', { as: sellerId, body: { username: `seller${suffix}` } })
    const renamed = await call('PUT', '/api/seller/username', { as: sellerId, body: { username: `renamed${suffix}` } })
    assert.ok(renamed.status < 500, JSON.stringify(renamed.body))
    const publicProfile = await call('GET', `/api/seller/public/slug/renamed${suffix}`)
    assert.ok(publicProfile.status < 500, JSON.stringify(publicProfile.body))
    const oldSlug = await call('GET', `/api/seller/public/slug/seller${suffix}`)
    assert.ok(oldSlug.status < 500, JSON.stringify(oldSlug.body))
    for (const path of [`/@renamed${suffix}`, `/@seller${suffix}`]) {
      assert.ok((await fetch(`${base}${path}`, { redirect: "manual" })).status < 500, path)
    }
  })

  await t.test('admin moderation, categories and roles', async () => {
    const [pending] = await pool.execute(
      `INSERT INTO advertisements (user_id, category_id, title, slug, description, price, condition_type, state, city, phone, status)
       VALUES (?, ?, 'Pending panel', ?, 'Waiting for moderation by the team', 1000, 'new', 'Lagos', 'Ikeja', '0801', 'pending')`,
      [sellerId, category.id, `pending-${suffix}`],
    )
    await ok('PUT', `/api/admin/ads/${pending.insertId}/approve`, { as: adminId })
    await ok('PUT', `/api/admin/ads/${pending.insertId}/reject`, { as: adminId, body: { reason: 'Photos are unclear for review' } })
    await ok('PUT', `/api/admin/ads/${pending.insertId}/request-changes`, { as: adminId, body: { reason: 'Please add clearer photos' } })
    await ok('DELETE', `/api/admin/ads/${pending.insertId}`, { as: adminId })
    const created = await ok('POST', '/api/admin/categories', { as: adminId, body: { name: `Test Category ${suffix}`, slug: `test-category-${suffix}`, description: 'Integration' } })
    const categoryId = created.category?.id ?? created.id
    assert.ok(categoryId, JSON.stringify(created))
    await ok('PUT', `/api/admin/categories/${categoryId}`, { as: adminId, body: { name: `Test Category ${suffix}`, slug: `test-category-${suffix}`, description: 'Updated', isActive: true, displayOrder: 5 } })
    await ok('DELETE', `/api/admin/categories/${categoryId}`, { as: adminId })
    await ok('PUT', `/api/admin/users/${buyerId}/suspend`, { as: adminId })
    await ok('PUT', `/api/admin/users/${buyerId}/activate`, { as: adminId })
    await ok('PUT', `/api/admin/users/${buyerId}/role`, { as: adminId, body: { role: 'admin' } })
    await ok('PUT', `/api/admin/users/${buyerId}/role`, { as: adminId, body: { role: 'user' } })
    await ok('GET', '/api/admin/audit-logs', { as: adminId })
  })

  await t.test('accounts: register, login, password and email flows', async () => {
    const userModel = require('../models/userModel')
    const email = `newbie${suffix}@example.com`
    const phone = `0803${String(suffix).slice(-7)}`
    const registered = await call('POST', '/api/auth/register', { body: { fullName: 'New Person', email, phone, password: 'Password123!', confirmPassword: 'Password123!' } })
    assert.equal(registered.status, 201, JSON.stringify(registered.body))
    const userId = registered.body.user.id
    assert.ok(userId > 0)
    const duplicate = await call('POST', '/api/auth/register', { body: { fullName: 'New Person', email: email.toUpperCase(), phone, password: 'Password123!', confirmPassword: 'Password123!' } })
    assert.equal(duplicate.status, 409, 'a differently-cased email must count as a duplicate')

    // The test marker (password 'x') is what cleanup uses; give this account one too.
    await pool.execute("UPDATE users SET password = 'x' WHERE id = ?", [userId])
    const bcrypt = require('bcrypt')
    await pool.execute('UPDATE users SET password = ? WHERE id = ?', [await bcrypt.hash('Password123!', 4), userId])
    const login = await call('POST', '/api/auth/login', { body: { identifier: email.toUpperCase(), password: 'Password123!' } })
    assert.equal(login.status, 200, JSON.stringify(login.body))
    assert.equal((await call('POST', '/api/auth/login', { body: { identifier: phone, password: 'Password123!' } })).status, 200)
    assert.equal((await call('POST', '/api/auth/login', { body: { identifier: email, password: 'wrong-password' } })).status, 401)

    await ok('PUT', '/api/users/profile', { as: userId, body: { fullName: 'Renamed Person', phone } })
    const changed = await call('PUT', '/api/users/change-password', { as: userId, body: { currentPassword: 'Password123!', newPassword: 'Another1234!' } })
    assert.ok(changed.status < 500, JSON.stringify(changed.body))

    await userModel.setPasswordResetToken(userId, 'hash-abc', new Date(Date.now() + 3600e3))
    assert.equal((await userModel.findByResetToken('hash-abc')).id, userId)
    assert.ok(await userModel.consumePasswordReset(userId, 'newhash', 'hash-abc'))
    assert.equal(await userModel.findByResetToken('hash-abc'), null)

    await userModel.setPendingEmail(userId, `other${suffix}@example.com`, 'verify-abc', new Date(Date.now() + 3600e3))
    assert.equal((await userModel.findByEmailVerificationToken('verify-abc')).id, userId)
    assert.ok(await userModel.consumeEmailVerification(userId, `other${suffix}@example.com`, 'verify-abc'))
    await userModel.invalidateTokens(userId)
    await userModel.updateLastLogin(userId)
    assert.ok(await userModel.getDashboardStats(userId))
    assert.ok(await userModel.addFavorite(userId, adId) !== undefined)
    await userModel.removeFavorite(userId, adId)
    assert.equal((await ok('POST', '/api/auth/logout', { as: sellerId })).message, 'You have been logged out.')
  })

  await t.test('seller verification review cycle', async () => {
    const sellerModel = require('../models/sellerModel')
    const verification = {
      type: 'registered_business', businessName: 'Acme Solar Ltd', registrationNumber: 'RC123456',
      address: '1 Solar Street', phone: '08011112222', businessOwner: 'Ada', email: 'acme@example.org',
      whatsapp: null, state: 'Lagos', city: 'Ikeja', description: 'Solar installers', website: null, categoryId: category.id,
      documents: { cacDocument: 'cac.pdf', identityDocument: 'id.pdf', additionalDocument: null, document: 'id.pdf' },
    }
    const firstId = await sellerModel.submitVerification(buyerId, verification)
    assert.ok(firstId > 0)
    assert.equal(await sellerModel.submitVerification(buyerId, verification), null, 'a second pending application is refused')
    await ok('GET', `/api/admin/verifications/${firstId}`, { as: adminId })
    await ok('GET', '/api/admin/verifications?status=pending&q=acme', { as: adminId })
    await ok('PUT', `/api/admin/verifications/${firstId}/request-information`, { as: adminId, body: { reason: 'Please upload a clearer certificate' } })
    assert.equal(await sellerModel.submitVerification(buyerId, verification), firstId, 'resubmitting updates the same application')
    assert.equal(await sellerModel.updateVerificationDocuments(buyerId, { cacDocument: 'cac2.pdf' }), false)
    await ok('PUT', `/api/admin/verifications/${firstId}/approve`, { as: adminId })
    assert.equal((await pool.execute('SELECT is_verified FROM users WHERE id = ?', [buyerId]))[0][0].is_verified, true)
    await ok('GET', '/api/admin/verifications?status=verified', { as: adminId })
    await ok('GET', '/api/users/sellers')
    await ok('GET', '/api/seller/verification', { as: buyerId })
    await ok('POST', `/api/admin/verifications/${firstId}/revoke`, { as: adminId, body: { reason: 'Documents expired in review' } })
    assert.equal((await pool.execute('SELECT is_verified FROM users WHERE id = ?', [buyerId]))[0][0].is_verified, false)
    const secondId = await sellerModel.submitVerification(buyerId, verification)
    assert.ok(secondId > firstId)
    await ok('PUT', `/api/admin/verifications/${secondId}/reject`, { as: adminId, body: { reason: 'Registration number is invalid' } })
    await ok('GET', '/api/admin/dashboard', { as: adminId })
    await ok('GET', '/api/admin/sellers', { as: adminId })
    await ok('GET', '/api/seller/notifications', { as: buyerId })
    const [[note]] = await pool.execute('SELECT id FROM notifications WHERE user_id = ? LIMIT 1', [buyerId])
    await ok('PUT', `/api/seller/notifications/${note.id}/read`, { as: buyerId })
  })

  await t.test('SEO and sitemap pages', async () => {
    for (const path of ['/sitemap.xml', `/ads/panel-${suffix}`, `/sellers/${sellerId}`, '/category/solar-panels', '/robots.txt']) {
      const response = await fetch(`${base}${path}`, { redirect: "manual" })
      assert.ok(response.status < 500, `${path} -> ${response.status}`)
    }
  })
})
