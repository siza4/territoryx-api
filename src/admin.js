export function requireAdmin(req, res, next) {
  // SECURITY: app_metadata only — it's server-controlled. user_metadata is editable
  // by the user themselves via the client SDK and must never grant admin.
  const role = req.user?.app_metadata?.role;
  if (role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  next();
}
