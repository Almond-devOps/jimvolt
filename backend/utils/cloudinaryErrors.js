/** Builds a user-facing error for a Cloudinary upload that was rejected, and logs the details. */
async function rejectedUploadError(response) {
  let reason = ''
  try {
    const body = await response.json()
    reason = typeof body?.error?.message === 'string' ? body.error.message : ''
  } catch {
    // The response body was not JSON; fall back to the status code.
  }
  console.error(`Cloudinary rejected an upload (HTTP ${response.status}): ${reason || 'no details'}`)

  let message = 'The image storage service rejected this image. Try a different image.'
  if (response.status === 401 || response.status === 403) {
    message = 'Image storage is misconfigured on the server (Cloudinary credentials were refused). Please contact support.'
  } else if (reason) {
    message = `The image storage service rejected this image: ${reason}`
  }
  const error = new Error(message)
  error.statusCode = 502
  return error
}

module.exports = { rejectedUploadError }
