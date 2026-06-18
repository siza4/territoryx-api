// src/middleware/admin.js
// Must be used AFTER requireAuth.
// Checks that the authenticated user has admin role in their app_metadata.

function requireAdmin(req, res, next) {
  const role = req.user?.app_metadata?.role
             || req.user?.user_metadata?.role
             || req.user?.role;

  if (role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

module.exports = { requireAdmin };
