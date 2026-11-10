const heicBrands = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs', 'mif1', 'msf1', 'heif'])
const heicMimeTypes = new Set(['image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence'])
const heicExtensions = new Set(['.heic', '.heif', '.hif'])

function isHeic(buffer) {
  return Buffer.isBuffer(buffer)
    && buffer.length >= 12
    && buffer.subarray(4, 8).toString('ascii') === 'ftyp'
    && heicBrands.has(buffer.subarray(8, 12).toString('ascii').toLowerCase())
}

/** True when the browser/phone declared this file as an iPhone-style HEIC/HEIF photo. */
function looksLikeHeic(file) {
  const type = String(file?.mimetype || '').toLowerCase()
  const name = String(file?.originalname || '').toLowerCase()
  const extension = name.includes('.') ? name.slice(name.lastIndexOf('.')) : ''
  return heicMimeTypes.has(type)
    || (['', 'application/octet-stream'].includes(type) && heicExtensions.has(extension))
}

function conversionError(message, statusCode = 400) {
  const error = new Error(message)
  error.statusCode = statusCode
  return error
}

async function convertHeicToJpeg(buffer) {
  let convert
  try {
    convert = require('heic-convert')
  } catch {
    throw conversionError('This server cannot process iPhone (HEIC) photos yet. Please upload a JPG or PNG instead.', 415)
  }
  try {
    const output = await convert({ buffer, format: 'JPEG', quality: 0.85 })
    return Buffer.from(output)
  } catch {
    throw conversionError('This iPhone (HEIC) photo could not be read. Please choose a different photo or convert it to JPG first.')
  }
}

/**
 * Converts any HEIC/HEIF uploads in `files` to JPEG in place so the rest of the
 * pipeline (signature checks, Cloudinary, disk storage) only sees JPEG.
 */
async function normalizeHeicFiles(files) {
  for (const file of files || []) {
    if (!file || !Buffer.isBuffer(file.buffer)) continue
    if (!isHeic(file.buffer)) {
      if (looksLikeHeic(file)) throw conversionError('This file is named like an iPhone photo but is not a valid HEIC image.')
      continue
    }
    file.buffer = await convertHeicToJpeg(file.buffer)
    file.mimetype = 'image/jpeg'
    file.size = file.buffer.length
    const base = String(file.originalname || 'photo').replace(/\.[^.]+$/, '') || 'photo'
    file.originalname = `${base}.jpg`
  }
}

module.exports = { heicMimeTypes, isHeic, looksLikeHeic, convertHeicToJpeg, normalizeHeicFiles }
