function requireSuperAdmin(req, res, next) {
  if (req.user?.role !== 'super_admin') {
    return res.status(403).json({ message: 'Super administrator access is required.' })
  }
  next()
}

module.exports = requireSuperAdmin
