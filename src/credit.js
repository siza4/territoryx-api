// src/routes/admin/credit.js
const express = require('express');
const router  = express.Router();
const { supabaseAdmin } = require('../../supabase');
const { sendEmail, creditApprovedEmail, creditRejectedEmail } = require('../../email/sender');

// GET /api/admin/credit/applications
// Returns all non-rejected credit applications (bypasses RLS)
router.get('/applications', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('credit_accounts')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Enrich with auth user emails
    const enriched = await Promise.all(data.map(async (row) => {
      try {
        const { data: { user } } = await supabaseAdmin.auth.admin.getUserById(row.user_id);
        return { ...row, auth_email: user?.email || null, company_name: user?.user_metadata?.company_name || null };
      } catch {
        return { ...row, auth_email: null, company_name: null };
      }
    }));

    res.json({ applications: enriched });
  } catch (err) {
    console.error('GET /applications:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/credit/:userId/approve
// Body: { limit: number }  (in cents)
router.post('/:userId/approve', async (req, res) => {
  const { userId } = req.params;
  const { limit } = req.body;

  if (!limit || typeof limit !== 'number' || limit <= 0) {
    return res.status(400).json({ error: 'limit (cents, positive number) is required' });
  }

  try {
    // 1. Update credit_accounts
    const { error } = await supabaseAdmin
      .from('credit_accounts')
      .update({
        status: 'ACTIVE',
        credit_limit: limit,
        available: limit,
        used: 0,
        reviewed_at: new Date().toISOString(),
        reviewed_by: req.user.id
      })
      .eq('user_id', userId);

    if (error) throw error;

    // 2. Get company profile for email
    const { data: account } = await supabaseAdmin
      .from('credit_accounts')
      .select('company_profile')
      .eq('user_id', userId)
      .single();

    const profile = account?.company_profile || {};
    const email   = profile.email || null;
    const company = profile.company || 'Your Company';

    // 3. Send approval email
    if (email) {
      await sendEmail({
        to: email,
        subject: '✓ Your TerritoryX Credit Has Been Approved',
        html: creditApprovedEmail({ company, limit })
      });
    }

    res.json({ ok: true, message: `Credit approved for user ${userId}`, limit });
  } catch (err) {
    console.error('POST /:userId/approve:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/credit/:userId/reject
// Body: { reason: string }
router.post('/:userId/reject', async (req, res) => {
  const { userId } = req.params;
  const { reason } = req.body;

  try {
    const { error } = await supabaseAdmin
      .from('credit_accounts')
      .update({
        status: 'REJECTED',
        credit_limit: 0,
        available: 0,
        rejection_reason: reason || 'Did not meet criteria',
        reviewed_at: new Date().toISOString(),
        reviewed_by: req.user.id
      })
      .eq('user_id', userId);

    if (error) throw error;

    const { data: account } = await supabaseAdmin
      .from('credit_accounts')
      .select('company_profile')
      .eq('user_id', userId)
      .single();

    const profile = account?.company_profile || {};
    const email   = profile.email || null;
    const company = profile.company || 'Your Company';

    if (email) {
      await sendEmail({
        to: email,
        subject: 'TerritoryX Credit Application Update',
        html: creditRejectedEmail({ company, reason: reason || 'Did not meet criteria' })
      });
    }

    res.json({ ok: true, message: `Application rejected for user ${userId}` });
  } catch (err) {
    console.error('POST /:userId/reject:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
