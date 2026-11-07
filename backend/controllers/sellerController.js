const fs = require('node:fs/promises')
const path = require('node:path')
const { validationResult } = require('express-validator')
const adModel = require('../models/adModel')
const categoryModel = require('../models/categoryModel')
const sellerModel = require('../models/sellerModel')
const { isValidNigerianPhone, normalizeNigerianPhone } = require('../utils/phone')
const { privateDirectory } = require('../middleware/verificationUpload')

function checkValidation(req) {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    const error = new Error(errors.array()[0].msg)
    error.statusCode = 400
    throw error
  }
}

function pagination(query) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1)
  const limit = Math.min(50, Math.max(1, Number.parseInt(query.limit, 10) || 20))
  return { page, limit, offset: (page - 1) * limit }
}

async function removeVerificationUploads(req) {
  const files = Object.values(req.verificationDocuments || {})
  if (!files.length && req.verificationDocumentPath) files.push(req.verificationDocumentPath)
  await Promise.all(files.map((file) => fs.unlink(path.join(privateDirectory, file)).catch(() => {})))
}

function slugify(name, userId) {
  const base = name.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 150) || 'seller'
  return `${base}-${userId}`
}

function dateRange(query) {
  const days = Number(query.days || 30)
  if (![7, 30, 90, 365].includes(days)) {
    const error = new Error('Choose an analytics range of 7, 30, 90, or 365 days.')
    error.statusCode = 400
    throw error
  }
  const end = query.to ? new Date(`${query.to}T00:00:00.000Z`) : new Date()
  const start = query.from
    ? new Date(`${query.from}T00:00:00.000Z`)
    : new Date(end.getTime() - (days - 1) * 86400000)
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start > end) {
    const error = new Error('Enter a valid analytics date range.')
    error.statusCode = 400
    throw error
  }
  if ((end - start) / 86400000 > 365) {
    const error = new Error('Analytics date ranges cannot exceed 365 days.')
    error.statusCode = 400
    throw error
  }
  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) }
}

async function dashboard(req, res) {
  const data = await sellerModel.getDashboard(req.user.id)
  const { offset, limit } = pagination({ page: 1, limit: 5 })
  const recentAds = await adModel.findOwnedAds({
    userId: req.user.id, status: null, search: '', sortBy: 'newest', limit, offset,
  })
  return res.json({ ...data, recentAdvertisements: recentAds })
}

async function advertisements(req, res) {
  checkValidation(req)
  const { page, limit, offset } = pagination(req.query)
  const filters = {
    userId: req.user.id,
    status: req.query.status || null,
    search: String(req.query.q || '').trim().slice(0, 100),
  }
  const [ads, total] = await Promise.all([
    adModel.findOwnedAds({ ...filters, sortBy: req.query.sort, limit, offset }),
    adModel.countOwnedAds(filters),
  ])
  return res.json({
    advertisements: ads,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  })
}

async function analytics(req, res) {
  checkValidation(req)
  if (req.params.advertisementId && !(await adModel.findOwnedById(req.params.advertisementId, req.user.id))) {
    const error = new Error('Advertisement not found.')
    error.statusCode = 404
    throw error
  }
  const range = dateRange(req.query)
  const data = await sellerModel.getAnalytics(
    req.user.id,
    range.from,
    range.to,
    req.params.advertisementId || null,
  )
  return res.json({ ...data, range })
}

async function profile(req, res) {
  return res.json({ profile: await sellerModel.getProfile(req.user.id) })
}

async function updateProfile(req, res) {
  checkValidation(req)
  const input = req.body
  if (input.phone && !isValidNigerianPhone(input.phone)) {
    const error = new Error('Enter a valid Nigerian business phone number.')
    error.statusCode = 400
    throw error
  }
  if (input.whatsapp && !isValidNigerianPhone(input.whatsapp)) {
    const error = new Error('Enter a valid Nigerian WhatsApp number.')
    error.statusCode = 400
    throw error
  }
  const categoryId = input.categoryId ? Number(input.categoryId) : null
  if (categoryId && !(await categoryModel.findByIdOrSlug(String(categoryId)))) {
    const error = new Error('Choose an existing business category.')
    error.statusCode = 400
    throw error
  }
  const profile = {
    businessName: input.businessName.trim(),
    slug: slugify(input.businessName.trim(), req.user.id),
    logoUrl: input.logoUrl?.trim() || null,
    description: input.description?.trim() || null,
    email: input.email?.trim().toLowerCase() || null,
    phone: input.phone ? normalizeNigerianPhone(input.phone) : null,
    whatsapp: input.whatsapp ? normalizeNigerianPhone(input.whatsapp) : null,
    websiteUrl: input.websiteUrl?.trim() || null,
    address: input.address?.trim() || null,
    state: input.state?.trim() || null,
    city: input.city?.trim() || null,
    yearsInBusiness: input.yearsInBusiness === '' || input.yearsInBusiness === undefined
      ? null
      : Number(input.yearsInBusiness),
    operatingHours: input.operatingHours?.trim() || null,
    categoryId,
  }
  await sellerModel.saveProfile(req.user.id, profile)
  return res.json({ message: 'Business profile saved.', profile: await sellerModel.getProfile(req.user.id) })
}

async function publicProfile(req, res) {
  const seller = await sellerModel.getPublicProfile(req.params.slug)
  if (!seller) {
    const error = new Error('Business profile not found.')
    error.statusCode = 404
    throw error
  }
  const advertisements = await adModel.findPublicBySeller(seller.seller_id)
  return res.json({ seller, advertisements })
}

async function submitVerification(req, res) {
  try {
    checkValidation(req)
  } catch (error) {
    await removeVerificationUploads(req)
    throw error
  }
  const documents = req.verificationDocuments || (req.verificationDocumentPath
    ? { document: req.verificationDocumentPath }
    : {})
  if (!Object.keys(documents).length) {
    const error = new Error('Attach at least one supporting verification document.')
    error.statusCode = 400
    throw error
  }
  if (!isValidNigerianPhone(req.body.businessPhone)) {
    await removeVerificationUploads(req)
    const error = new Error('Enter a valid Nigerian business phone number.')
    error.statusCode = 400
    throw error
  }
  if (req.body.whatsapp && !isValidNigerianPhone(req.body.whatsapp)) {
    await removeVerificationUploads(req)
    const error = new Error('Enter a valid Nigerian WhatsApp number.')
    error.statusCode = 400
    throw error
  }
  if (!req.body.businessName?.trim() || !req.body.businessOwner?.trim()) {
    await removeVerificationUploads(req)
    const error = new Error('Business name and owner name are required.')
    error.statusCode = 400
    throw error
  }
  if (req.body.businessEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(req.body.businessEmail.trim())) {
    await removeVerificationUploads(req)
    const error = new Error('Enter a valid business email address.')
    error.statusCode = 400
    throw error
  }
  const categoryId = req.body.businessCategoryId ? Number(req.body.businessCategoryId) : null
  if (categoryId && !(await categoryModel.findByIdOrSlug(String(categoryId)))) {
    await removeVerificationUploads(req)
    const error = new Error('Choose an existing business category.')
    error.statusCode = 400
    throw error
  }
  let id
  try {
    id = await sellerModel.submitVerification(req.user.id, {
      type: req.body.verificationType,
      businessName: req.body.businessName?.trim() || null,
      registrationNumber: req.body.registrationNumber?.trim() || null,
      address: req.body.businessAddress.trim(),
      phone: normalizeNigerianPhone(req.body.businessPhone),
      businessOwner: req.body.businessOwner.trim(),
      email: req.body.businessEmail?.trim().toLowerCase() || null,
      whatsapp: req.body.whatsapp ? normalizeNigerianPhone(req.body.whatsapp) : null,
      state: req.body.state?.trim() || null,
      city: req.body.city?.trim() || null,
      description: req.body.businessDescription?.trim() || null,
      website: req.body.website?.trim() || null,
      categoryId,
      documents,
    })
  } catch (error) {
    await removeVerificationUploads(req)
    throw error
  }
  if (!id) {
    await removeVerificationUploads(req)
    const error = new Error('A verification request is already awaiting review.')
    error.statusCode = 409
    throw error
  }
  return res.status(201).json({ message: 'Verification request submitted for review.', verification: await sellerModel.getVerification(req.user.id) })
}

async function updateVerification(req, res) {
  return submitVerification(req, res)
}

async function uploadVerificationDocuments(req, res) {
  if (!req.verificationDocuments || !Object.keys(req.verificationDocuments).length) {
    const error = new Error('Attach at least one verification document.')
    error.statusCode = 400
    throw error
  }
  try {
    const verification = await sellerModel.updateVerificationDocuments(req.user.id, req.verificationDocuments)
    if (!verification) {
      await removeVerificationUploads(req)
      const error = new Error('Documents can only be updated when additional information has been requested.')
      error.statusCode = 409
      throw error
    }
    return res.json({ message: 'Verification documents submitted for review.', verification })
  } catch (error) {
    if (error.statusCode !== 409) await removeVerificationUploads(req)
    throw error
  }
}

async function verification(req, res) {
  return res.json({ verification: await sellerModel.getVerification(req.user.id) })
}

async function notifications(req, res) {
  return res.json({ notifications: await sellerModel.listNotifications(req.user.id) })
}

async function markNotificationRead(req, res) {
  checkValidation(req)
  const updated = await sellerModel.markNotificationRead(req.user.id, req.params.id)
  if (!updated) {
    const error = new Error('Notification not found.')
    error.statusCode = 404
    throw error
  }
  return res.json({ message: 'Notification marked as read.' })
}

async function setAdvertisementStatus(req, res) {
  checkValidation(req)
  const status = req.body.status
  const updated = await adModel.setOwnedStatus(req.params.id, req.user.id, status)
  if (!updated) {
    const error = new Error('Only your active or paused advertisements can be changed this way.')
    error.statusCode = 404
    throw error
  }
  const ad = await adModel.findOwnedById(req.params.id, req.user.id)
  await sellerModel.createNotification({
    userId: req.user.id,
    type: status === 'paused' ? 'advertisement_paused' : 'advertisement_reactivated',
    title: status === 'paused' ? 'Advertisement paused' : 'Advertisement reactivated',
    body: `${ad.title} is now ${status}.`,
    advertisementId: req.params.id,
  })
  return res.json({ message: `Advertisement ${status}.` })
}

async function duplicateAdvertisement(req, res) {
  checkValidation(req)
  const source = await adModel.findOwnedById(req.params.id, req.user.id)
  if (!source) {
    const error = new Error('Advertisement not found.')
    error.statusCode = 404
    throw error
  }
  const duplicateId = await adModel.duplicateOwned(
    req.params.id,
    req.user.id,
    `${slugify(source.title, req.user.id)}-${Date.now()}`,
  )
  return res.status(201).json({ id: duplicateId, message: 'A copy has been submitted for review.' })
}

module.exports = {
  advertisements,
  analytics,
  dashboard,
  duplicateAdvertisement,
  markNotificationRead,
  notifications,
  profile,
  publicProfile,
  setAdvertisementStatus,
  submitVerification,
  updateVerification,
  uploadVerificationDocuments,
  updateProfile,
  verification,
}
