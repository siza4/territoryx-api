import { Router } from 'express';
import { supabaseAdmin } from './supabase.js';
import { sendEmail } from './sender.js';

const router = Router();

router.get('/applications', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('credit_accounts').select('*, user_id')
      .neq('status', 'REJECTED')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return res.json(data || []);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.post('/:userId/approve', async (req, res) => {
  const { userId } = req.params;
  const { limit } = req.body;
  try {
    await supabaseAdmin.from('credit_accounts').update({
      status: 'ACTIVE', credit_limit: limit, available: limit, used: 0,
      reviewed_at: new Date().toISOString()
    }).eq('user_id', userId);
    return res.json({ success: true, limit });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.post('/:userId/reject', async (req, res) => {
  const { userId } = req.params;
  const { reason } = req.body;
  try {
    await supabaseAdmin.from('credit_accounts').update({
      status: 'REJECTED', credit_limit: 0, available: 0,
      rejection_reason: reason || 'Did not meet criteria',
      reviewed_at: new Date().toISOString()
    }).eq('user_id', userId);
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

export default router;
