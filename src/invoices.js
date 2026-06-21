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
    const { data: row, error: fetchErr } = await supabaseAdmin
      .from('invoices').select('*').eq('invoice_id', invoiceId).single();
    if (fetchErr || !row) return res.status(404).json({ error: 'Invoice not found' });

    const updatedData = { ...(row.data || {}), status: 'PAID', paidAt: Date.now(), balanceDue: 0 };
    await supabaseAdmin.from('invoices').update({
      status: 'PAID', data: updatedData
    }).eq('invoice_id', invoiceId);

    // Reactivate credit if this invoice's account was suspended for non-payment
    if (row.user_id) {
      await supabaseAdmin.from('credit_accounts')
        .update({ status: 'ACTIVE' })
        .eq('user_id', row.user_id)
        .eq('status', 'SUSPENDED');
    }
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

export default router;
