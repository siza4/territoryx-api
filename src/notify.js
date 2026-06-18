import { Router } from 'express';
import { sendEmail } from './sender.js';

const router = Router();

router.post('/credit-application', async (req, res) => {
  const { company, limit, email } = req.body;
  if (process.env.ADMIN_EMAIL) {
    await sendEmail({
      to: process.env.ADMIN_EMAIL,
      subject: `New Credit Application — ${company}`,
      html: `<p>Company: ${company}</p><p>Limit: $${(limit / 100).toLocaleString()}</p>`
    });
  }
  return res.json({ notified: true });
});

router.post('/credit-approved', async (req, res) => {
  const { to, company, limit } = req.body;
  await sendEmail({ to, subject: 'Credit Approved',
    html: `<h2>Congratulations ${company}!</h2><p>Limit: $${(limit / 100).toLocaleString()}</p>` });
  return res.json({ notified: true });
});

router.post('/credit-rejected', async (req, res) => {
  const { to, company, reason } = req.body;
  await sendEmail({ to, subject: 'Credit Application Update',
    html: `<p>Reason: ${reason || 'Did not meet criteria'}</p>` });
  return res.json({ notified: true });
});

export default router;
