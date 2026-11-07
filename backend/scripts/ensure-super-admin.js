#!/usr/bin/env node
require('dotenv').config({ path: require('node:path').join(__dirname, '..', '.env') })

const { pool, connectDB } = require('../config/database')
const bcrypt = require('bcrypt')

async function main() {
  const envEmail = process.env.JIMVOLT_ADMIN_EMAIL || process.argv[2]
  const envPassword = process.env.JIMVOLT_ADMIN_PASSWORD || process.argv[3]

  if (!envEmail || !envPassword) {
    console.error('Usage: node scripts/ensure-super-admin.js <email> <password>')
    console.error('Or set JIMVOLT_ADMIN_EMAIL and JIMVOLT_ADMIN_PASSWORD in backend/.env before running.')
    process.exit(1)
  }

  const email = String(envEmail).trim().toLowerCase()
  const password = String(envPassword)

  if (password.length < 12) {
    console.error('Refusing to create a super administrator with a password shorter than 12 characters.')
    process.exit(1)
  }

  await connectDB()
  const [existingSuperAdmins] = await pool.query(
    "SELECT id, full_name, email FROM users WHERE role = 'super_admin' AND account_status = 'active' LIMIT 5",
  )

  if (existingSuperAdmins.length > 0) {
    console.log('A super administrator already exists. No new super-admin role was granted.')
    console.log(existingSuperAdmins.map((user) => `${user.full_name} <${user.email}>`).join('\n'))
    await pool.end()
    return
  }

  const [userRows] = await pool.query('SELECT id, full_name, email, role FROM users WHERE email = ? LIMIT 1', [email])
  if (!userRows.length) {
    console.error(`User ${email} was not found. Create or verify the account before promoting it to super_admin.`)
    await pool.end()
    process.exit(1)
  }

  const user = userRows[0]
  const passwordHash = await bcrypt.hash(password, 10)
  await pool.execute(
    `UPDATE users
     SET password = ?, role = 'super_admin', account_status = 'active', is_verified = TRUE, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [passwordHash, user.id],
  )

  console.log(`Promoted ${user.full_name || user.email} (${user.email}) to super_admin.`)
  console.log('Store the password in a secret manager and rotate it before production use.')
  await pool.end()
}

main().catch((error) => {
  console.error('Super-admin bootstrap failed:', error.message)
  process.exit(1)
})
