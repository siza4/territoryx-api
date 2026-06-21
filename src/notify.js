import { Router } from 'express';
import { sendEmail } from './sender.js';

const router = Router();

// Triggered by a logged-in user submitting their own credit application —
// alerts the admin. (credit-approved/credit-rejected used to be separate public
// routes here, but they trusted client-supplied "to"/"company"/"limit" fields,
// which let anyone send convincing fake approval emails to arbitrary addresses.
// Those are now sent directly from credit.js using data read from the database.)
router.post('/credit-application', async (req, res) => {
  const { company, limit } = req.body;
  if (!process.env.ADMIN_EMAIL) return res.json({ notified: false, reason: 'ADMIN_EMAIL not configured' });
  try {
    await sendEmail({
      to: process.env.ADMIN_EMAIL,
      subject: `New Credit Application — ${company || req.user.email}`,
      html: `<p>Company: ${company || 'N/A'}</p><p>Requested limit: $${Number(limit || 0).toLocaleString()}</p><p>Applicant: ${req.user.email}</p><p>Review in the admin panel.</p>`
    });
    return res.json({ notified: true });
  } catch (e) {
    return res.status(500).json({ notified: false, error: e.message });
  }
});

export default router;
