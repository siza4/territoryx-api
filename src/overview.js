import { Router } from 'express';
import { supabaseAdmin } from './supabase.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const [terRes, epRes, caRes, invRes, userRes] = await Promise.all([
      supabaseAdmin.from('territories').select('id, bid, brand, sudden'),
      supabaseAdmin.from('epochs').select('*').order('id', { ascending: false }).limit(1).single(),
      supabaseAdmin.from('credit_accounts').select('status, credit_limit'),
      supabaseAdmin.from('invoices').select('status, data'),
      supabaseAdmin.auth.admin.listUsers()
    ]);
    const territories = terRes.data || [];
    const epoch = epRes.data;
    const creditApps = caRes.data || [];
    const invoiceData = invRes.data || [];
    const users = userRes.data?.users || [];
    const total = invoiceData.reduce((s, i) => s + (i.data?.total || 0), 0);
    const collected = invoiceData.filter(i => i.status === 'PAID').reduce((s, i) => s + (i.data?.total || 0), 0);
    return res.json({
      epoch, totalTerritories: territories.length,
      suddenDeathCount: territories.filter(t => t.sudden).length,
      totalUsers: users.length,
      pendingApplications: creditApps.filter(c => c.status === 'PENDING').length,
      revenue: { total, collected }
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

export default router;
