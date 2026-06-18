// src/routes/notify.js
// These routes are called by the frontend when certain events happen.
// They are authenticated (requireAuth) but NOT admin-only,
// because users can trigger notifications about themselves.

const express = require('express');
const router  = express.Router();
const { sendEmail, creditApplicationEmail, ADMIN } = require('../email/sender');
const { supabaseAdmin } = require('../supabase');

// POST /api/notify/credit-application
// Called when a user submits a credit application
// Sends an email to admin
router.post('/credit-application', async (req, res) => {
  const { company, email, estimatedLimit, requestedAmount } = req.body;

  if (!company) return res.status(400).json({ error: 'company is required' });

  try {
    if (ADMIN) {
      await sendEmail({
        to: ADMIN,
        subject: `🔔 New Credit Application — ${company}`,
        html: creditApplicationEmail({ company, email, estimatedLimit, requestedAmount })
      });
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('POST /notify/credit-application:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
