const { Resend } = require('resend')

const DEFAULT_FROM = 'Jimvolt <no-reply@jimvolt.local>'

function getClient() {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return null
  return new Resend(apiKey)
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]))
}

// Sends through Resend. Without RESEND_API_KEY (local development) the
// message is logged instead, so the flow still works without a provider.
async function sendEmail({ to, subject, html, logLabel, logLink }) {
  const resend = getClient()
  const from = process.env.EMAIL_FROM || DEFAULT_FROM

  if (!resend) {
    console.log(`[email] ${logLabel} for ${to}. Link: ${logLink}`)
    return { ok: true, preview: logLink }
  }

  const { data, error } = await resend.emails.send({ from, to, subject, html })
  if (error) {
    const failure = new Error(`Resend could not send email: ${error.message || error.name || 'unknown error'}`)
    failure.statusCode = 502
    throw failure
  }
  return { ok: true, id: data?.id }
}

async function sendPasswordResetEmail(email, resetUrl) {
  return sendEmail({
    to: email,
    subject: 'Reset your Jimvolt password',
    html: `
      <p>Hello,</p>
      <p>We received a request to reset your password.</p>
      <p><a href="${escapeHtml(resetUrl)}">Reset your password</a></p>
      <p>This link expires in 1 hour. If you did not request this, you can ignore this email.</p>
    `,
    logLabel: 'Password reset requested',
    logLink: resetUrl,
  })
}

async function sendEmailVerification(email, verificationUrl) {
  return sendEmail({
    to: email,
    subject: 'Verify your new Jimvolt email address',
    html: `<p>Confirm your new email address for Jimvolt.</p><p><a href="${escapeHtml(verificationUrl)}">Verify email address</a></p><p>This link expires in 24 hours.</p>`,
    logLabel: 'Email change verification requested',
    logLink: verificationUrl,
  })
}

async function sendWelcomeEmail(email, fullName) {
  const siteUrl = process.env.PUBLIC_SITE_URL || process.env.FRONTEND_URL || 'http://localhost:5173'
  return sendEmail({
    to: email,
    subject: 'Welcome to Jimvolt',
    html: `
      <p>Hello ${escapeHtml(fullName)},</p>
      <p>Welcome to Jimvolt. Your account is ready.</p>
      <p><a href="${escapeHtml(siteUrl)}">Browse the marketplace</a></p>
    `,
    logLabel: 'Welcome email',
    logLink: siteUrl,
  })
}

module.exports = { sendEmailVerification, sendPasswordResetEmail, sendWelcomeEmail }
