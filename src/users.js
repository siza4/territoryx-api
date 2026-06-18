import { Router } from 'express';
import { supabaseAdmin } from './supabase.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers();
    if (error) throw error;
    const users = (data.users || []).map(u => ({
      id: u.id, email: u.email,
      role: u.app_metadata?.role || 'user',
      company_name: u.user_metadata?.company_name,
      created_at: u.created_at
    }));
    return res.json(users);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.patch('/:userId/role', async (req, res) => {
  const { userId } = req.params;
  const { role } = req.body;
  try {
    const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      app_metadata: { role }
    });
    if (error) throw error;
    return res.json({ success: true, role });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

export default router;
