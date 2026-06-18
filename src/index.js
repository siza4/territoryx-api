// src/jobs/index.js
// Scheduled background jobs using node-cron.
// These run inside the Express process — they only execute when the server is awake.
// On Render free tier (spins down after 15 min) use Render's Cron Job service instead.

const cron = require('node-cron');
const { supabaseAdmin } = require('../supabase');
const { sendEmail } = require('../email/sender');

function log(msg) { console.log(`[CRON ${new Date().toISOString()}] ${msg}`); }

// ── Collections Check — runs every hour ─────────────────────────────────────
// 1. Marks overdue invoices and applies 1.5% late fee
// 2. Suspends accounts that are 14+ days past due
// 3. Forfeits territories of suspended accounts
cron.schedule('0 * * * *', async () => {
  log('Running collections check...');
  const now = new Date();

  try {
    // 1. Find ISSUED invoices past their due date
    const { data: overdueInvoices } = await supabaseAdmin
      .from('invoices')
      .select('*')
      .eq('status', 'ISSUED')
      .lt('due_date', now.toISOString());

    for (const inv of overdueInvoices || []) {
      const lateFee = Math.floor((inv.total || 0) * 0.015);
      await supabaseAdmin.from('invoices').update({
        status: 'OVERDUE',
        late_fee_applied: lateFee,
        late_fee_applied_at: now.toISOString(),
        total: inv.total + lateFee,
        balance_due: (inv.balance_due || inv.total) + lateFee
      }).eq('invoice_id', inv.invoice_id);

      log(`Invoice ${inv.invoice_number} marked OVERDUE — late fee $${lateFee / 100}`);
    }

    // 2. Find OVERDUE invoices past the 14-day grace period → suspend
    const graceCutoff = new Date(now - 14 * 24 * 60 * 60 * 1000);
    const { data: suspendCandidates } = await supabaseAdmin
      .from('invoices')
      .select('user_id, invoice_number')
      .eq('status', 'OVERDUE')
      .lt('due_date', graceCutoff.toISOString());

    const usersSuspended = new Set();
    for (const inv of suspendCandidates || []) {
      if (usersSuspended.has(inv.user_id)) continue;

      // Suspend credit account
      const { data: creditAcc } = await supabaseAdmin
        .from('credit_accounts')
        .select('status, company_profile')
        .eq('user_id', inv.user_id)
        .single();

      if (creditAcc && creditAcc.status === 'ACTIVE') {
        await supabaseAdmin.from('credit_accounts')
          .update({ status: 'SUSPENDED' })
          .eq('user_id', inv.user_id);

        // Forfeit territories — find by company name
        const company = creditAcc.company_profile?.company;
        if (company) {
          await supabaseAdmin.from('territories')
            .update({ brand: 'UNCLAIMED', color: '#666666', bid: 80000 })
            .eq('brand', company);
        }

        log(`Account SUSPENDED: user ${inv.user_id} (${company}) — non-payment`);
        usersSuspended.add(inv.user_id);

        // Notify user
        const email = creditAcc.company_profile?.email;
        if (email) {
          await sendEmail({
            to: email,
            subject: '⚠ TerritoryX Account Suspended — Non-Payment',
            html: `<div style="font-family:monospace;padding:32px;background:#04060B;color:#E2E8F0;max-width:600px;margin:auto">
              <h2 style="color:#EF4444">ACCOUNT SUSPENDED</h2>
              <p>Your TerritoryX account (${company}) has been suspended due to non-payment of invoice ${inv.invoice_number}.</p>
              <p>All territory holdings have been forfeited.</p>
              <p>Contact finance@territoryx.africa to resolve your outstanding balance.</p>
            </div>`
          }).catch(() => {});
        }
      }
    }

    if ((overdueInvoices?.length || 0) + usersSuspended.size > 0) {
      log(`Collections done — ${overdueInvoices?.length || 0} overdue, ${usersSuspended.size} suspended`);
    } else {
      log('Collections done — nothing to action');
    }
  } catch (err) {
    log('Collections ERROR: ' + err.message);
  }
});

// ── Epoch Auto-Settle — runs every 5 minutes ─────────────────────────────────
// Checks if the current epoch has expired and triggers settlement
cron.schedule('*/5 * * * *', async () => {
  try {
    const { data: epoch } = await supabaseAdmin
      .from('epochs')
      .select('*')
      .eq('status', 'ACTIVE')
      .order('number', { ascending: false })
      .limit(1)
      .single();

    if (!epoch) return;

    if (new Date(epoch.ends_at) < new Date()) {
      log(`Epoch ${epoch.number} expired — auto-settling...`);
      // Call the settle endpoint internally
      const fetch = require('node-fetch').default || require('node-fetch');
      const port  = process.env.PORT || 3001;
      const adminKey = process.env.INTERNAL_CRON_SECRET || 'cron-secret-change-me';
      await fetch(`http://localhost:${port}/api/internal/epoch/settle`, {
        method: 'POST',
        headers: { 'x-cron-secret': adminKey }
      });
      log(`Epoch auto-settle triggered`);
    }
  } catch (err) {
    // Silently ignore — epoch may not exist yet
  }
});

log('Cron jobs registered: collections (hourly), epoch-check (every 5 min)');
