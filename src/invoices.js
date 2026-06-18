// src/routes/admin/invoices.js
const express = require('express');
const router  = express.Router();
const { supabaseAdmin } = require('../../supabase');
const { generateInvoicePdf } = require('../../pdf/invoicePdf');

// GET /api/admin/invoices
// Returns all invoices across all users
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('invoices')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ invoices: data || [], total: data?.length || 0 });
  } catch (err) {
    console.error('GET /invoices:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/invoices/:invoiceId
// Returns a single invoice
router.get('/:invoiceId', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('invoices')
      .select('*')
      .eq('invoice_id', req.params.invoiceId)
      .single();

    if (error || !data) return res.status(404).json({ error: 'Invoice not found' });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/invoices/:invoiceId/mark-paid
// Marks an invoice as paid and unsuspends the account if needed
router.post('/:invoiceId/mark-paid', async (req, res) => {
  const { invoiceId } = req.params;
  try {
    // Get the invoice first
    const { data: inv, error: fetchErr } = await supabaseAdmin
      .from('invoices')
      .select('*')
      .eq('invoice_id', invoiceId)
      .single();

    if (fetchErr || !inv) return res.status(404).json({ error: 'Invoice not found' });
    if (inv.status === 'PAID') return res.status(400).json({ error: 'Invoice is already paid' });

    const now = new Date().toISOString();

    // Mark paid
    const { error: updateErr } = await supabaseAdmin
      .from('invoices')
      .update({
        status: 'PAID',
        paid_at: now,
        amount_paid: inv.total,
        balance_due: 0
      })
      .eq('invoice_id', invoiceId);

    if (updateErr) throw updateErr;

    // Unsuspend credit account if it was suspended
    await supabaseAdmin
      .from('credit_accounts')
      .update({ status: 'ACTIVE' })
      .eq('user_id', inv.user_id)
      .eq('status', 'SUSPENDED');

    res.json({ ok: true, message: `Invoice ${invoiceId} marked as PAID` });
  } catch (err) {
    console.error('POST /:invoiceId/mark-paid:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/invoices/:invoiceId/pdf
// Streams a PDF of the invoice (also accessible by the invoice owner via /api/invoices/:id/pdf)
router.get('/:invoiceId/pdf', async (req, res) => {
  try {
    const { data: inv, error } = await supabaseAdmin
      .from('invoices')
      .select('*')
      .eq('invoice_id', req.params.invoiceId)
      .single();

    if (error || !inv) return res.status(404).json({ error: 'Invoice not found' });

    generateInvoicePdf(inv, res);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
