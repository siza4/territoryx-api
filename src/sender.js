import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
dotenv.config();

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587');
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;

let transporter = null;
if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
  transporter = nodemailer.createTransport({
    host: SMTP_HOST, port: SMTP_PORT, secure: SMTP_PORT === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS }
  });
}

export async function sendEmail(opts) {
  const from = opts.from || process.env.ADMIN_EMAIL || 'TerritoryX <noreply@territoryx.africa>';
  if (transporter) {
    await transporter.sendMail({ from, to: opts.to, subject: opts.subject, html: opts.html });
    console.log(`[EMAIL] Sent to ${opts.to}: ${opts.subject}`);
    return;
  }
  console.log(`[EMAIL] Would send to ${opts.to}: ${opts.subject}`);
}
