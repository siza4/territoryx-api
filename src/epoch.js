// src/routes/admin/epoch.js
const express = require('express');
const router  = express.Router();
const { supabaseAdmin } = require('../../supabase');
const { sendEmail, invoiceEmail } = require('../../email/sender');

function fmt(cents) { return '$' + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 }); }
function generateInvoiceNumber(counter) {
  return `TX-${new Date().getFullYear()}-${String(counter).padStart(6, '0')}`;
}

// POST /api/admin/epoch/settle
// Settles the current epoch:
//  1. Finds the winning bid per territory
//  2. Generates invoices for all winners
//  3. Resets territory bids to floor
//  4. Expires all accepted bids
//  5. Releases credit for all users
//  6. Starts a new epoch
router.post('/settle', async (req, res) => {
  try {
    // ── 1. Get current active epoch ──────────────────────────
    const { data: epoch, error: epochErr } = await supabaseAdmin
      .from('epochs')
      .select('*')
      .eq('status', 'ACTIVE')
      .order('number', { ascending: false })
      .limit(1)
      .single();

    if (epochErr || !epoch) return res.status(400).json({ error: 'No active epoch found' });

    // ── 2. Get all accepted bids (one per territory, highest) ──
    const { data: allBids, error: bidsErr } = await supabaseAdmin
      .from('bids')
      .select('*')
      .eq('status', 'ACCEPTED')
      .order('amount', { ascending: false });

    if (bidsErr) throw bidsErr;

    // Deduplicate: one winning bid per territory (already sorted highest first)
    const winningBids = {};
    (allBids || []).forEach(bid => {
      if (!winningBids[bid.territory_id]) winningBids[bid.territory_id] = bid;
    });

    // ── 3. Get territories ───────────────────────────────────
    const { data: territories } = await supabaseAdmin
      .from('territories')
      .select('*');
    const terrMap = {};
    (territories || []).forEach(t => { terrMap[t.id] = t; });

    // ── 4. Get invoice counter ───────────────────────────────
    const { data: existingInvoices } = await supabaseAdmin
      .from('invoices')
      .select('invoice_number')
      .order('created_at', { ascending: false })
      .limit(1);

    let counter = 0;
    if (existingInvoices && existingInvoices.length) {
      const lastNum = existingInvoices[0].invoice_number;
      counter = parseInt(lastNum.split('-')[2] || '0');
    }

    // ── 5. Generate invoices for all winners ─────────────────
    const invoicesToInsert = [];
    const emailJobs = [];

    for (const [territoryId, bid] of Object.entries(winningBids)) {
      const t = terrMap[territoryId];
      if (!t || !bid) continue;

      const toll  = Math.floor(bid.amount * 0.05);  // 5% platform toll
      const total = bid.amount + toll;
      const now   = Date.now();
      counter++;

      // Get credit account for billing info
      const { data: creditAcc } = await supabaseAdmin
        .from('credit_accounts')
        .select('company_profile')
        .eq('user_id', bid.user_id)
        .single();

      const profile = creditAcc?.company_profile || {};
      const company = profile.company || 'Unknown Company';
      const email   = profile.email || null;

      const invoice = {
        invoice_id:        `inv_${now}_${Math.random().toString(36).substr(2, 9)}`,
        invoice_number:    generateInvoiceNumber(counter),
        user_id:           bid.user_id,
        territory_id:      territoryId,
        territory_name:    t.city || territoryId,
        epoch_number:      epoch.number,
        epoch_name:        epoch.name,
        status:            'ISSUED',
        billed_to_company: company,
        billed_to_email:   email,
        subtotal:          total,
        total:             total,
        balance_due:       total,
        amount_paid:       0,
        late_fee_applied:  0,
        due_date:          new Date(now + 30 * 24 * 60 * 60 * 1000).toISOString(),
        created_at:        new Date(now).toISOString(),
        line_items: [
          { description: `Territory Ownership: ${t.city}, ${t.country} (${epoch.name})`, amount: bid.amount, type: 'TERRITORY_BID' },
          { description: 'Platform Toll (5%)', amount: toll, type: 'PLATFORM_TOLL' }
        ]
      };

      invoicesToInsert.push(invoice);

      // Queue email
      if (email) {
        emailJobs.push({ invoice, company, email });
      }
    }

    // Insert all invoices
    if (invoicesToInsert.length > 0) {
      const { error: invErr } = await supabaseAdmin.from('invoices').insert(invoicesToInsert);
      if (invErr) throw invErr;
    }

    // ── 6. Reset all territory bids to 10% floor ─────────────
    for (const t of territories || []) {
      const newBid = Math.max(Math.floor((t.bid || 0) * 0.1), 80000); // min $800 in cents
      await supabaseAdmin.from('territories').update({
        bid: newBid,
        sudden: false,
        threat: 1,
        own_days: 0,
        history: [],
        challengers: []
      }).eq('id', t.id);
    }

    // ── 7. Expire all accepted bids ──────────────────────────
    await supabaseAdmin.from('bids').update({ status: 'EXPIRED' }).eq('status', 'ACCEPTED');

    // ── 8. Release credit for all users (reset used → 0, available → limit) ──
    const { data: allCredits } = await supabaseAdmin
      .from('credit_accounts')
      .select('user_id, credit_limit')
      .eq('status', 'ACTIVE');

    for (const acc of allCredits || []) {
      await supabaseAdmin.from('credit_accounts').update({
        used: 0,
        available: acc.credit_limit
      }).eq('user_id', acc.user_id);
    }

    // ── 9. Start new epoch ───────────────────────────────────
    const nowMs = Date.now();
    const newEpoch = {
      number:       epoch.number + 1,
      name:         `EPOCH ${String(epoch.number + 1).padStart(2, '0')}`,
      status:       'ACTIVE',
      started_at:   new Date(nowMs).toISOString(),
      ends_at:      new Date(nowMs + 7 * 24 * 60 * 60 * 1000).toISOString(),
      total_volume: 0,
      platform_toll: 0
    };
    await supabaseAdmin.from('epochs').insert(newEpoch);

    // Close the old epoch
    await supabaseAdmin.from('epochs').update({ status: 'CLOSED' }).eq('number', epoch.number);

    // ── 10. Send invoice emails (non-blocking) ────────────────
    emailJobs.forEach(({ invoice, company, email }) => {
      sendEmail({
        to: email,
        subject: `Invoice ${invoice.invoice_number} — TerritoryX`,
        html: invoiceEmail({ invoice, company, email })
      }).catch(err => console.warn('Invoice email failed:', err.message));
    });

    console.log(`✓ Epoch ${epoch.number} settled — ${invoicesToInsert.length} invoices generated`);

    res.json({
      ok: true,
      settled_epoch: epoch.number,
      new_epoch: newEpoch.number,
      invoices_generated: invoicesToInsert.length,
      territories_reset: territories?.length || 0
    });
  } catch (err) {
    console.error('POST /epoch/settle:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/epoch/current
router.get('/current', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('epochs')
      .select('*')
      .order('number', { ascending: false })
      .limit(1)
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
