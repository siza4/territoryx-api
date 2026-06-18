import { Router } from 'express';
import { supabaseAdmin } from './supabase.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('invoices').select('*, user_id')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return res.json(data || []);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.post('/:invoiceId/mark-paid', async (req, res) => {
  const { invoiceId } = req.params;
  try {
    await supabaseAdmin.from('invoices').update({
      status: 'PAID', paid_at: new Date().toISOString()
    }).eq('invoice_id', invoiceId);
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

export default router;
