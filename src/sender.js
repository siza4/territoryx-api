import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
dotenv.config();

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.FROM_EMAIL || 'TerritoryX <noreply@territoryx.africa>';

// Optional SMTP fallback, only used if Resend isn't configured.
const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587');
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;

let transporter = null;
if (!RESEND_API_KEY && SMTP_HOST && SMTP_USER && SMTP_PASS) {
  transporter = nodemailer.createTransport({
    host: SMTP_HOST, port: SMTP_PORT, secure: SMTP_PORT === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS }
  });
}

export async function sendEmail(opts) {
  // Primary path: Resend (matches .env.example, free tier 3,000/month, no SMTP setup needed)
  if (RESEND_API_KEY) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: opts.from || FROM_EMAIL, to: opts.to, subject: opts.subject, html: opts.html })
    });
    if (!res.ok) {
      const body = await res.text();
      console.error(`[EMAIL] Resend failed (${res.status}):`, body);
      throw new Error(`Resend send failed: ${res.status}`);
    }
    console.log(`[EMAIL] Sent via Resend to ${opts.to}: ${opts.subject}`);
    return;
  }

  // Fallback path: SMTP, if configured
  if (transporter) {
    await transporter.sendMail({ from: opts.from || FROM_EMAIL, to: opts.to, subject: opts.subject, html: opts.html });
    console.log(`[EMAIL] Sent via SMTP to ${opts.to}: ${opts.subject}`);
    return;
  }

  // Neither configured — don't pretend it worked
  console.warn(`[EMAIL] NOT SENT (no RESEND_API_KEY or SMTP configured) — would have sent to ${opts.to}: ${opts.subject}`);
  throw new Error('No email provider configured (set RESEND_API_KEY in .env)');
}
