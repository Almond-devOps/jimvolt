function requireAdmin(req, res, next) {
  if (!['admin', 'super_admin'].includes(req.user?.role)) {
    return res.status(403).json({ message: 'Administrator access is required.' })
  }
  next()
}

module.exports = requireAdmin
