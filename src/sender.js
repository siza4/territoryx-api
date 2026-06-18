// src/email/sender.js
// Uses Resend (https://resend.com) — free tier: 3,000 emails/month, 100/day.
// If RESEND_API_KEY is not set, emails are logged to console instead (dev mode).

const { Resend } = require('resend');
require('dotenv').config();

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM = process.env.FROM_EMAIL || 'noreply@territoryx.africa';
const ADMIN = process.env.ADMIN_EMAIL || '';

async function sendEmail({ to, subject, html }) {
  if (!resend) {
    // Dev fallback — just log it
    console.log('\n📧 [EMAIL — no RESEND_API_KEY set]');
    console.log('  To:', to);
    console.log('  Subject:', subject);
    console.log('  Body (truncated):', html.slice(0, 200));
    return { ok: true, dev: true };
  }
  try {
    const { data, error } = await resend.emails.send({ from: FROM, to, subject, html });
    if (error) throw error;
    return { ok: true, id: data.id };
  } catch (err) {
    console.error('Email send failed:', err.message);
    return { ok: false, error: err.message };
  }
}

// ── Email Templates ──────────────────────────────────────

function creditApplicationEmail({ company, email, estimatedLimit, requestedAmount }) {
  const fmt = (cents) => '$' + (cents / 100).toLocaleString();
  return `
    <div style="font-family:monospace;max-width:600px;margin:auto;background:#04060B;color:#E2E8F0;padding:32px;border:1px solid #00F2FE22">
      <h2 style="color:#00F2FE;letter-spacing:.1em">NEW CREDIT APPLICATION</h2>
      <p style="color:#94a3b8">A company has applied for credit on TerritoryX.</p>
      <table style="width:100%;border-collapse:collapse;margin-top:16px">
        <tr><td style="color:#64748b;padding:6px 0">Company</td><td style="color:#E2E8F0;font-weight:700">${company}</td></tr>
        <tr><td style="color:#64748b;padding:6px 0">Email</td><td style="color:#E2E8F0">${email}</td></tr>
        <tr><td style="color:#64748b;padding:6px 0">Requested</td><td style="color:#F59E0B;font-weight:700">${fmt(requestedAmount)}</td></tr>
        <tr><td style="color:#64748b;padding:6px 0">Est. Max</td><td style="color:#E2E8F0">${fmt(estimatedLimit)}</td></tr>
      </table>
      <p style="margin-top:24px;color:#64748b">Log in to the admin panel to review and approve or reject this application.</p>
    </div>`;
}

function creditApprovedEmail({ company, limit }) {
  const fmt = (cents) => '$' + (cents / 100).toLocaleString();
  return `
    <div style="font-family:monospace;max-width:600px;margin:auto;background:#04060B;color:#E2E8F0;padding:32px;border:1px solid #22C55E44">
      <h2 style="color:#22C55E;letter-spacing:.1em">✓ CREDIT APPROVED</h2>
      <p style="color:#94a3b8">Congratulations — your credit line is now active.</p>
      <table style="width:100%;border-collapse:collapse;margin-top:16px">
        <tr><td style="color:#64748b;padding:6px 0">Company</td><td style="color:#E2E8F0;font-weight:700">${company}</td></tr>
        <tr><td style="color:#64748b;padding:6px 0">Credit Limit</td><td style="color:#22C55E;font-weight:700;font-size:20px">${fmt(limit)}</td></tr>
      </table>
      <p style="margin-top:24px;color:#94a3b8">Sign in to TerritoryX and start placing bids on African billboard territories.</p>
      <a href="${process.env.FRONTEND_URL || 'https://territoryx.africa'}" 
         style="display:inline-block;margin-top:16px;padding:12px 24px;background:#00F2FE;color:#04060B;font-weight:700;text-decoration:none;letter-spacing:.1em">
        START BIDDING →
      </a>
    </div>`;
}

function creditRejectedEmail({ company, reason }) {
  return `
    <div style="font-family:monospace;max-width:600px;margin:auto;background:#04060B;color:#E2E8F0;padding:32px;border:1px solid #EF444444">
      <h2 style="color:#EF4444;letter-spacing:.1em">APPLICATION UPDATE</h2>
      <p style="color:#94a3b8">We have reviewed your credit application for TerritoryX.</p>
      <table style="width:100%;border-collapse:collapse;margin-top:16px">
        <tr><td style="color:#64748b;padding:6px 0">Company</td><td style="color:#E2E8F0;font-weight:700">${company}</td></tr>
        <tr><td style="color:#64748b;padding:6px 0">Decision</td><td style="color:#EF4444;font-weight:700">NOT APPROVED</td></tr>
        <tr><td style="color:#64748b;padding:6px 0;vertical-align:top">Reason</td><td style="color:#E2E8F0">${reason || 'Did not meet current criteria'}</td></tr>
      </table>
      <p style="margin-top:24px;color:#64748b">You may reapply after 30 days or contact us for more information.</p>
    </div>`;
}

function invoiceEmail({ invoice, company, email }) {
  const fmt = (cents) => '$' + (cents / 100).toLocaleString();
  return `
    <div style="font-family:monospace;max-width:600px;margin:auto;background:#04060B;color:#E2E8F0;padding:32px;border:1px solid #00F2FE22">
      <h2 style="color:#00F2FE;letter-spacing:.1em">INVOICE ${invoice.invoice_number}</h2>
      <p style="color:#94a3b8">A new invoice has been issued for your territory ownership.</p>
      <table style="width:100%;border-collapse:collapse;margin-top:16px">
        <tr><td style="color:#64748b;padding:6px 0">Company</td><td style="color:#E2E8F0;font-weight:700">${company}</td></tr>
        <tr><td style="color:#64748b;padding:6px 0">Territory</td><td style="color:#E2E8F0">${invoice.territory_name}</td></tr>
        <tr><td style="color:#64748b;padding:6px 0">Amount Due</td><td style="color:#F59E0B;font-weight:700;font-size:18px">${fmt(invoice.balance_due)}</td></tr>
        <tr><td style="color:#64748b;padding:6px 0">Due Date</td><td style="color:#E2E8F0">${new Date(invoice.due_date).toLocaleDateString()}</td></tr>
      </table>
      <p style="margin-top:24px;color:#64748b">Payment details: Bank — FNB · Account — 1234567890 · Reference: ${invoice.invoice_number}</p>
    </div>`;
}

module.exports = { sendEmail, creditApplicationEmail, creditApprovedEmail, creditRejectedEmail, invoiceEmail, ADMIN };
