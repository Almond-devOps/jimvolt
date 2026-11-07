#!/usr/bin/env node
require('dotenv').config({ path: require('node:path').join(__dirname, '..', '.env') })

const readline = require('node:readline/promises')
const { stdin, stdout } = require('node:process')
const bcrypt = require('bcrypt')
const { isValidNigerianPhone, normalizeNigerianPhone } = require('../utils/phone')

function validateInput({ fullName, email, phone, password, passwordConfirmation }) {
  const name = String(fullName || '').trim()
  const normalizedEmail = String(email || '').trim().toLowerCase()
  const normalizedPhone = normalizeNigerianPhone(String(phone || '').trim())
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

  if (!name || name.length > 120 || /[\u0000-\u001f\u007f]/.test(name)) {
    throw new Error('Full name is required and must be 120 characters or fewer.')
  }
  if (normalizedEmail.length > 254 || !emailPattern.test(normalizedEmail)) {
    throw new Error('Enter a valid email address (maximum 254 characters).')
  }
  if (!isValidNigerianPhone(normalizedPhone)) {
    throw new Error('Enter a valid Nigerian mobile phone number.')
  }
  if (typeof password !== 'string' || password.length < 12) {
    throw new Error('Password must be at least 12 characters long.')
  }
  if (Buffer.byteLength(password, 'utf8') > 72) {
    throw new Error('Password must not exceed 72 UTF-8 bytes.')
  }
  if (password !== passwordConfirmation) {
    throw new Error('The passwords do not match.')
  }

  return { fullName: name, email: normalizedEmail, phone: normalizedPhone }
}

async function promptHidden(promptText) {
  if (!stdin.isTTY || typeof stdin.setRawMode !== 'function') {
    throw new Error('Run this command in an interactive terminal so the password can be entered without echo.')
  }

  stdout.write(promptText)
  stdin.setRawMode(true)
  stdin.resume()

  return new Promise((resolve, reject) => {
    let value = ''
    const cleanup = () => {
      stdin.removeListener('data', onData)
      stdin.setRawMode(false)
      stdout.write('\n')
    }
    const onData = (chunk) => {
      const input = chunk.toString('utf8')
      if (input === '\u0003') {
        cleanup()
        reject(new Error('Input cancelled.'))
        return
      }
      if (input === '\r' || input === '\n') {
        cleanup()
        resolve(value)
        return
      }
      if (input === '\u007f' || input === '\b') {
        value = Array.from(value).slice(0, -1).join('')
        return
      }
      if (!/[\u0000-\u001f\u007f]/.test(input)) value += input
    }

    stdin.on('data', onData)
  })
}

async function promptForAdministrator() {
  const terminal = readline.createInterface({ input: stdin, output: stdout })
  try {
    const fullName = await terminal.question('Administrator full name: ')
    const email = await terminal.question('Email address: ')
    const phone = await terminal.question('Nigerian phone number: ')
    terminal.close()

    const password = await promptHidden('Password (minimum 12 characters; input hidden): ')
    const passwordConfirmation = await promptHidden('Confirm password (input hidden): ')
    return { fullName, email, phone, password, passwordConfirmation }
  } catch (error) {
    terminal.close()
    throw error
  }
}

async function createSuperAdmin(input) {
  const account = validateInput(input)
  const { pool, connectDB } = require('../config/database')

  try {
    await connectDB()

    const [columns] = await pool.query('SHOW COLUMNS FROM users')
    const columnNames = new Set(columns.map((column) => column.Field))
    for (const requiredColumn of ['full_name', 'email', 'phone', 'password', 'role']) {
      if (!columnNames.has(requiredColumn)) {
        throw new Error(`The existing users table is missing the required "${requiredColumn}" column.`)
      }
    }

    const roleColumn = columns.find((column) => column.Field === 'role')
    if (!roleColumn.Type.includes("'super_admin'")) {
      if (!/^enum\('user','admin'\)$/i.test(roleColumn.Type.replace(/\s/g, ''))) {
        throw new Error('The users.role column has an unsupported definition; refusing to alter it automatically.')
      }
      await pool.query(
        "ALTER TABLE users MODIFY role ENUM('user', 'admin', 'super_admin') NOT NULL DEFAULT 'user'",
      )
    }

    const [existing] = await pool.execute(
      'SELECT id FROM users WHERE email = ? OR phone = ? LIMIT 1',
      [account.email, account.phone],
    )
    if (existing.length) {
      throw new Error('An account with that email address or phone number already exists.')
    }

    const passwordHash = await bcrypt.hash(input.password, 12)
    const insertColumns = ['full_name', 'email', 'phone', 'password', 'role']
    const insertValues = [account.fullName, account.email, account.phone, passwordHash, 'super_admin']
    if (columnNames.has('account_status')) {
      insertColumns.push('account_status')
      insertValues.push('active')
    }
    const placeholders = insertColumns.map(() => '?').join(', ')

    try {
      const [result] = await pool.execute(
        `INSERT INTO users (${insertColumns.join(', ')}) VALUES (${placeholders})`,
        insertValues,
      )
      return result.insertId
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') {
        throw new Error('An account with that email address or phone number already exists.')
      }
      throw error
    }
  } finally {
    await pool.end()
  }
}

async function main() {
  if (!stdin.isTTY || typeof stdin.setRawMode !== 'function') {
    throw new Error('Run this command in an interactive terminal so the password can be entered without echo.')
  }
  const input = await promptForAdministrator()
  const id = await createSuperAdmin(input)
  console.log(`Super administrator account created successfully (user ID: ${id}).`)
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Could not create the super administrator: ${error.message}`)
    if (error.code) console.error(`Database error code: ${error.code}`)
    process.exitCode = 1
  })
}

module.exports = { createSuperAdmin, validateInput }
