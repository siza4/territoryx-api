import { Router } from 'express';
import { supabaseAdmin } from './supabase.js';
import { sendEmail } from './sender.js';

const router = Router();

// POST /api/admin/epoch/settle
// Called by admin only (middleware in index.js enforces this).
// Mirrors exactly what the frontend's settleEpoch() does, but runs server-side
// with the service-role key — so it's the authoritative version that actually
// generates invoices for ALL winners across ALL users, not just the current browser session.
router.post('/settle', async (req, res) => {
  try {
    // 1. Load active epoch
    const { data: epoch, error: epochErr } = await supabaseAdmin
      .from('epochs').select('*').eq('status', 'ACTIVE').single();
    if (epochErr || !epoch) return res.status(400).json({ error: 'No active epoch found' });

    // 2. Load all territories with their pending leader (set by place_bid)
    const { data: territories, error: tErr } = await supabaseAdmin
      .from('territories').select('*');
    if (tErr) return res.status(500).json({ error: tErr.message });

    // 3. Load the winning accepted bid per territory (for invoice billing info)
    const { data: acceptedBids } = await supabaseAdmin
      .from('bids').select('*').eq('status', 'ACCEPTED');
    const bidByTerritory = {};
    (acceptedBids || []).forEach(b => {
      if (!bidByTerritory[b.territory_id] || b.amount > bidByTerritory[b.territory_id].amount) {
        bidByTerritory[b.territory_id] = b;
      }
    });

    const invoicesGenerated = [];
    const now = new Date();

    // 4. For each territory:
    //    - If it has a pending_brand → that company won → generate invoice → promote to display
    //    - If no pending_brand → previous owner keeps their spot uncontested, no invoice
    for (const t of territories) {
      const winningBid = bidByTerritory[t.id];

      if (t.pending_brand && winningBid) {
        // Fetch the winner's credit account for billing info
        const { data: creditAccount } = await supabaseAdmin
          .from('credit_accounts').select('*').eq('user_id', winningBid.user_id).single();
        const profile = creditAccount?.company_profile || {};

        // Generate invoice
        const invoiceNumber = `TXI-${epoch.number}-${t.id.toUpperCase()}-${Date.now()}`;
        const toll = winningBid.toll_buffer || Math.floor(winningBid.amount * 0.05);
        const total = winningBid.amount + toll;
        const dueDate = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000); // 14-day payment window

        const invoiceData = {
          invoiceNumber,
          status: 'ISSUED',
          issuedAt: now.getTime(),
          dueDate: dueDate.getTime(),
          epochId: epoch.number,
          territoryId: t.id,
          territoryName: t.city || t.id,
          billedTo: {
            companyName: profile.company || t.pending_brand,
            email: profile.email || ''
          },
          lineItems: [
            { description: `Territory: ${t.city || t.id} — ${epoch.name}`, quantity: 1, amount: winningBid.amount },
            { description: 'Platform toll (5%)', quantity: 1, amount: toll }
          ],
          subtotal: winningBid.amount,
          total,
          balanceDue: total,
          lateFeeApplied: 0
        };

        await supabaseAdmin.from('invoices').insert({
          invoice_id: invoiceNumber,
          invoice_number: invoiceNumber,
          user_id: winningBid.user_id,
          status: 'ISSUED',
          data: invoiceData
        });

        invoicesGenerated.push({ territory: t.id, invoiceNumber, total, winner: t.pending_brand });

        // Promote pending leader to locked display
        const newBid = Math.max(Math.floor(t.bid * 0.1), 8000);
        await supabaseAdmin.from('territories').update({
          brand: t.pending_brand,
          color: t.pending_color || '#00F2FE',
          tagline: t.pending_tagline || 'Territory holder',
          own_days: 1,
          threat: Math.max(1, Math.floor(Math.random() * 3) + 1),
          bid: newBid,
          sudden: false,
          pending_brand: null,
          pending_color: null,
          pending_tagline: null
        }).eq('id', t.id);

        // Email the winner
        if (profile.email) {
          try {
            await sendEmail({
              to: profile.email,
              subject: `TerritoryX — You won ${t.city || t.id}! Invoice enclosed`,
              html: `<h2>Congratulations ${profile.company || t.pending_brand}!</h2>
                <p>You have won the <strong>${t.city || t.id}</strong> territory for <strong>${epoch.name}</strong>.</p>
                <p>Your billboard will now be displayed to all visitors nearest to that territory.</p>
                <p><strong>Invoice: ${invoiceNumber}</strong><br/>
                Amount due: $${total.toLocaleString()}<br/>
                Due date: ${dueDate.toLocaleDateString()}</p>
                <p>Bank: First National Bank<br/>Account: 1234567890<br/>Reference: ${invoiceNumber}</p>
                <p>Questions: finance@territoryx.africa</p>`
            });
          } catch (e) {
            console.warn(`Win email failed for ${profile.email}:`, e.message);
          }
        }
      } else if (!t.pending_brand && t.brand && t.brand !== 'UNCLAIMED') {
        // No challenger — previous owner keeps their billboard, no invoice this cycle
        const newBid = Math.max(Math.floor(t.bid * 0.1), 8000);
        await supabaseAdmin.from('territories').update({
          own_days: (t.own_days || 0) + 1,
          bid: newBid,
          sudden: false,
          pending_brand: null,
          pending_color: null,
          pending_tagline: null
        }).eq('id', t.id);
      } else {
        // Unclaimed and no bids — just reset bid floor
        const newBid = Math.max(Math.floor(t.bid * 0.1), 8000);
        await supabaseAdmin.from('territories').update({
          bid: newBid,
          sudden: false,
          pending_brand: null
        }).eq('id', t.id);
      }
    }

    // 5. Expire all accepted bids
    await supabaseAdmin.from('bids').update({ status: 'EXPIRED' }).eq('status', 'ACCEPTED');

    // 6. Release all credit holds (credit accounts reset available to their limit)
    const { data: creditAccounts } = await supabaseAdmin
      .from('credit_accounts').select('*').eq('status', 'ACTIVE');
    for (const ca of (creditAccounts || [])) {
      await supabaseAdmin.from('credit_accounts').update({
        used: 0, available: ca.credit_limit
      }).eq('user_id', ca.user_id);
    }

    // 7. Close the current epoch and open the next one
    await supabaseAdmin.from('epochs').update({ status: 'CLOSED' }).eq('number', epoch.number);
    const newNum = (epoch.number || 0) + 1;
    const ends = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    await supabaseAdmin.from('epochs').insert({
      number: newNum,
      name: 'EPOCH ' + String(newNum).padStart(2, '0'),
      status: 'ACTIVE',
      started_at: now.toISOString(),
      ends_at: ends.toISOString(),
      total_volume: 0,
      platform_toll: 0
    });

    // 8. Notify admin of settlement summary
    if (process.env.ADMIN_EMAIL) {
      try {
        await sendEmail({
          to: process.env.ADMIN_EMAIL,
          subject: `TerritoryX — ${epoch.name} Settled · ${invoicesGenerated.length} invoices`,
          html: `<h2>${epoch.name} Settlement Complete</h2>
            <p>${invoicesGenerated.length} territory/territories won, ${invoicesGenerated.length} invoices generated.</p>
            <table border="1" cellpadding="6">
              <tr><th>Territory</th><th>Winner</th><th>Invoice</th><th>Amount</th></tr>
              ${invoicesGenerated.map(i => `<tr><td>${i.territory}</td><td>${i.winner}</td><td>${i.invoiceNumber}</td><td>$${i.total.toLocaleString()}</td></tr>`).join('')}
            </table>
            <p>Next epoch: EPOCH ${String(newNum).padStart(2, '0')}</p>`
        });
      } catch (e) {
        console.warn('Admin settlement email failed:', e.message);
      }
    }

    return res.json({
      success: true,
      epochClosed: epoch.number,
      newEpoch: newNum,
      invoicesGenerated: invoicesGenerated.length,
      invoices: invoicesGenerated
    });
  } catch (e) {
    console.error('Epoch settle error:', e);
    return res.status(500).json({ error: e.message });
  }
});

// GET /api/admin/epoch/current
router.get('/current', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('epochs').select('*').eq('status', 'ACTIVE').single();
    if (error) return res.status(404).json({ error: 'No active epoch' });
    return res.json(data);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

export default router;
