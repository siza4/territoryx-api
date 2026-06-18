// src/middleware/auth.js
// Reads the Bearer token from the request, verifies it with Supabase,
// and attaches the user object to req.user.

const { supabaseAdmin } = require('../supabase');

async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }

  const token = authHeader.replace('Bearer ', '').trim();

  try {
    // Ask Supabase to validate the token and return the user
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    req.token = token;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token verification failed' });
  }
}

module.exports = { requireAuth };
