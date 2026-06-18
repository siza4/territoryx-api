// src/routes/admin/overview.js
const express = require('express');
const router  = express.Router();
const { supabaseAdmin } = require('../../supabase');

// GET /api/admin/overview
// Returns real aggregated stats across all users and territories
router.get('/', async (req, res) => {
  try {
    const [
      territoriesRes,
      epochRes,
      creditRes,
      invoicesRes,
      usersRes
    ] = await Promise.all([
      supabaseAdmin.from('territories').select('id, bid, brand, sudden, color'),
      supabaseAdmin.from('epochs').select('*').order('number', { ascending: false }).limit(1).single(),
      supabaseAdmin.from('credit_accounts').select('status, credit_limit, user_id'),
      supabaseAdmin.from('invoices').select('status, total, late_fee_applied, balance_due, user_id'),
      supabaseAdmin.auth.admin.listUsers({ perPage: 1000 })
    ]);

    const territories = territoriesRes.data || [];
    const epoch = epochRes.data || {};
    const credits = creditRes.data || [];
    const invoiceList = invoicesRes.data || [];
    const users = usersRes.data?.users || [];

    // Revenue calculations
    const totalRevenue = invoiceList.reduce((s, i) => s + (i.total || 0), 0);
    const collected    = invoiceList.filter(i => i.status === 'PAID').reduce((s, i) => s + (i.total || 0), 0);
    const lateFees     = invoiceList.reduce((s, i) => s + (i.late_fee_applied || 0), 0);
    const outstanding  = invoiceList.filter(i => i.status !== 'PAID').reduce((s, i) => s + (i.balance_due || 0), 0);

    // Platform toll = 5% of total volume (from epoch)
    const platformToll = epoch.platform_toll || 0;

    res.json({
      epoch: {
        number: epoch.number,
        name: epoch.name,
        status: epoch.status,
        started_at: epoch.started_at,
        ends_at: epoch.ends_at,
        total_volume: epoch.total_volume || 0,
        platform_toll: platformToll
      },
      territories: {
        total: territories.length,
        sudden_death: territories.filter(t => t.sudden).length,
        unclaimed: territories.filter(t => !t.brand || t.brand === 'UNCLAIMED').length,
        top_bid: Math.max(...territories.map(t => t.bid || 0), 0)
      },
      users: {
        total: users.length,
        confirmed: users.filter(u => u.confirmed_at).length,
        admins: users.filter(u => u.app_metadata?.role === 'admin').length
      },
      credit: {
        pending: credits.filter(c => c.status === 'PENDING').length,
        active: credits.filter(c => c.status === 'ACTIVE').length,
        suspended: credits.filter(c => c.status === 'SUSPENDED').length,
        rejected: credits.filter(c => c.status === 'REJECTED').length,
        total_issued: credits.reduce((s, c) => s + (c.credit_limit || 0), 0)
      },
      revenue: {
        total: totalRevenue,
        collected,
        outstanding,
        late_fees: lateFees,
        platform_toll: platformToll
      },
      invoices: {
        total: invoiceList.length,
        issued: invoiceList.filter(i => i.status === 'ISSUED').length,
        overdue: invoiceList.filter(i => i.status === 'OVERDUE').length,
        paid: invoiceList.filter(i => i.status === 'PAID').length
      }
    });
  } catch (err) {
    console.error('GET /overview:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
