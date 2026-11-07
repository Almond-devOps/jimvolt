const categoryModel = require('../models/categoryModel')

async function list(req, res) {
  await categoryModel.ensureInitialCategories()
  return res.json({ categories: await categoryModel.findAll() })
}

async function getById(req, res) {
  const category = await categoryModel.findByIdOrSlug(req.params.id)
  if (!category) return res.status(404).json({ message: 'Category not found.' })
  return res.json({ category })
}

module.exports = { getById, list }
