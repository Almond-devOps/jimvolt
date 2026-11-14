const { pool } = require('../config/database')

async function summary(sellerId, reviewerId) {
  const [rows] = await pool.execute(
    'SELECT AVG(score) AS average, COUNT(*) AS count FROM seller_ratings WHERE seller_id = ?', [sellerId],
  )
  let mine = null
  if (reviewerId) {
    const [ratings] = await pool.execute('SELECT score FROM seller_ratings WHERE seller_id = ? AND reviewer_id = ?', [sellerId, reviewerId])
    mine = ratings.length ? Number(ratings[0].score) : null
  }
  return { average: rows[0].average == null ? null : Number(rows[0].average), count: Number(rows[0].count), mine }
}

async function save(sellerId, reviewerId, score) {
  await pool.execute(
    `INSERT INTO seller_ratings (seller_id, reviewer_id, score) VALUES (?, ?, ?)
     ON CONFLICT (seller_id, reviewer_id) DO UPDATE SET score = EXCLUDED.score`, [sellerId, reviewerId, score],
  )
  return summary(sellerId, reviewerId)
}

module.exports = { summary, save }
