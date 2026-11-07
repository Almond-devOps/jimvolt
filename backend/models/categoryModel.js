const { pool } = require('../config/database')

const initialCategories = [
  ['Solar Panels', 'solar-panels', 'New and used solar photovoltaic panels.'],
  ['Solar Inverters', 'solar-inverters', 'Grid-tie, off-grid and hybrid inverters.'],
  ['Solar Batteries', 'solar-batteries', 'Energy storage batteries and battery banks.'],
  ['Solar Generators', 'solar-generators', 'Portable and backup solar generators.'],
  ['Solar Street Lights', 'solar-street-lights', 'Solar street lights and security lighting.'],
  ['Solar Water Pumps', 'solar-water-pumps', 'Water pumping systems for homes and farms.'],
  ['Solar Accessories', 'solar-accessories', 'Solar cables, connectors and accessory parts.'],
  ['Energy Storage Systems', 'energy-storage-systems', 'Battery banks and storage equipment.'],
  ['Wind Energy Equipment', 'wind-energy-equipment', 'Small wind turbines and related components.'],
  ['Solar Installation Services', 'solar-installation-services', 'Professional installation and project services.'],
  ['Solar Maintenance and Repairs', 'solar-maintenance-repairs', 'Solar maintenance, repairs and support services.'],
  ['Other Renewable Energy Products', 'other-renewable-energy', 'Other renewable energy products and services.'],
]

async function ensureInitialCategories() {
  for (const [name, slug, description] of initialCategories) {
    await pool.execute(
      `INSERT INTO categories (name, slug, description)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE name = VALUES(name)`,
      [name, slug, description],
    )
  }
}

async function findAll() {
  const [rows] = await pool.execute(
    'SELECT id, name, slug, description, image, created_at FROM categories WHERE is_active = TRUE ORDER BY display_order, name ASC',
  )
  return rows
}

async function findByIdOrSlug(value) {
  const [rows] = await pool.execute(
    'SELECT id, name, slug, description, image, created_at FROM categories WHERE is_active = TRUE AND (id = ? OR slug = ?) LIMIT 1',
    [value, value],
  )
  return rows[0] || null
}

module.exports = { ensureInitialCategories, findAll, findByIdOrSlug }
