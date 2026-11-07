const nodemailer = require('nodemailer')

function createTransporter() {
  const { EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASS } = process.env
  if (!EMAIL_HOST || !EMAIL_USER || !EMAIL_PASS) {
    return null
  }

  return nodemailer.createTransport({
    host: EMAIL_HOST,
    port: Number(EMAIL_PORT || 587),
    secure: Number(EMAIL_PORT || 587) === 465,
    auth: {
      user: EMAIL_USER,
      pass: EMAIL_PASS,
    },
  })
}

async function sendPasswordResetEmail(email, resetUrl) {
  const transporter = createTransporter()
  const from = process.env.EMAIL_FROM || 'Jimvolt <no-reply@jimvolt.local>'

  if (!transporter) {
    console.log(`[auth] Password reset requested for ${email}. Reset URL: ${resetUrl}`)
    return { ok: true, preview: resetUrl }
  }

  await transporter.sendMail({
    from,
    to: email,
    subject: 'Reset your Jimvolt password',
    html: `
      <p>Hello,</p>
      <p>We received a request to reset your password.</p>
      <p><a href="${resetUrl}">Reset your password</a></p>
      <p>This link expires in 1 hour.</p>
    `,
  })

  return { ok: true }
}

async function sendEmailVerification(email, verificationUrl) {
  const transporter = createTransporter()
  const from = process.env.EMAIL_FROM || 'Jimvolt <no-reply@jimvolt.local>'

  if (!transporter) {
    console.log(`[auth] Email change verification requested for ${email}. Verification URL: ${verificationUrl}`)
    return { ok: true, preview: verificationUrl }
  }

  await transporter.sendMail({
    from,
    to: email,
    subject: 'Verify your new Jimvolt email address',
    html: `<p>Confirm your new email address for Jimvolt.</p><p><a href="${verificationUrl}">Verify email address</a></p><p>This link expires in 24 hours.</p>`,
  })
  return { ok: true }
}

module.exports = { sendEmailVerification, sendPasswordResetEmail }
