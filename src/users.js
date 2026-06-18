// src/routes/admin/users.js
const express = require('express');
const router  = express.Router();
const { supabaseAdmin } = require('../../supabase');

// GET /api/admin/users
// Returns all auth users with their roles and credit status
router.get('/', async (req, res) => {
  try {
    // List all auth users (requires service role)
    const { data: { users }, error } = await supabaseAdmin.auth.admin.listUsers({
      perPage: 1000
    });
    if (error) throw error;

    // Get credit accounts for all users in one query
    const { data: credits } = await supabaseAdmin
      .from('credit_accounts')
      .select('user_id, status, credit_limit, company_profile');

    const creditMap = {};
    (credits || []).forEach(c => { creditMap[c.user_id] = c; });

    const enriched = users.map(u => ({
      id: u.id,
      email: u.email,
      role: u.app_metadata?.role || 'user',
      company_name: u.user_metadata?.company_name || creditMap[u.id]?.company_profile?.company || null,
      credit_status: creditMap[u.id]?.status || null,
      credit_limit: creditMap[u.id]?.credit_limit || 0,
      created_at: u.created_at,
      last_sign_in: u.last_sign_in_at,
      email_confirmed: !!u.confirmed_at
    }));

    res.json({ users: enriched, total: enriched.length });
  } catch (err) {
    console.error('GET /users:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/admin/users/:userId/role
// Body: { role: 'admin' | 'user' | 'suspended' }
router.patch('/:userId/role', async (req, res) => {
  const { userId } = req.params;
  const { role } = req.body;

  const validRoles = ['admin', 'user', 'suspended'];
  if (!validRoles.includes(role)) {
    return res.status(400).json({ error: `role must be one of: ${validRoles.join(', ')}` });
  }

  try {
    const { data, error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      app_metadata: { role }
    });
    if (error) throw error;

    // If suspending, also suspend their credit account
    if (role === 'suspended') {
      await supabaseAdmin
        .from('credit_accounts')
        .update({ status: 'SUSPENDED' })
        .eq('user_id', userId)
        .eq('status', 'ACTIVE');
    }

    res.json({ ok: true, user: { id: data.user.id, email: data.user.email, role } });
  } catch (err) {
    console.error('PATCH /:userId/role:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
