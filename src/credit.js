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
  if (!limit || limit <= 0) return res.status(400).json({ error: 'A positive limit is required' });
  try {
    const { data: account, error: fetchErr } = await supabaseAdmin
      .from('credit_accounts').select('*').eq('user_id', userId).single();
    if (fetchErr || !account) return res.status(404).json({ error: 'Credit account not found' });

    await supabaseAdmin.from('credit_accounts').update({
      status: 'ACTIVE', credit_limit: limit, available: limit, used: 0,
      reviewed_at: new Date().toISOString()
    }).eq('user_id', userId);

    const profile = account.company_profile || {};
    if (profile.email) {
      try {
        await sendEmail({
          to: profile.email,
          subject: 'TerritoryX — Credit Approved',
          html: `<h2>Congratulations ${profile.company || ''}!</h2><p>Your credit application has been approved.</p><p><strong>Credit Limit:</strong> $${limit.toLocaleString()}</p><p>You can now start bidding on territories.</p>`
        });
      } catch (e) { console.warn('Approval email failed:', e.message); }
    }
    return res.json({ success: true, limit });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.post('/:userId/reject', async (req, res) => {
  const { userId } = req.params;
  const { reason } = req.body;
  try {
    const { data: account, error: fetchErr } = await supabaseAdmin
      .from('credit_accounts').select('*').eq('user_id', userId).single();
    if (fetchErr || !account) return res.status(404).json({ error: 'Credit account not found' });

    await supabaseAdmin.from('credit_accounts').update({
      status: 'REJECTED', credit_limit: 0, available: 0,
      rejection_reason: reason || 'Did not meet criteria',
      reviewed_at: new Date().toISOString()
    }).eq('user_id', userId);

    const profile = account.company_profile || {};
    if (profile.email) {
      try {
        await sendEmail({
          to: profile.email,
          subject: 'TerritoryX — Credit Application Update',
          html: `<h2>Hello ${profile.company || ''},</h2><p>Your credit application was not approved at this time.</p><p><strong>Reason:</strong> ${reason || 'Did not meet criteria'}</p><p>You may reapply with updated information.</p>`
        });
      } catch (e) { console.warn('Rejection email failed:', e.message); }
    }
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

export default router;
