import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { supabaseAdmin } from './supabase.js';
import { verifyJWT } from './auth.js';
import { requireAdmin } from './admin.js';

import creditRoutes from './credit.js';
import usersRoutes from './users.js';
import invoicesRoutes from './invoices.js';
import overviewRoutes from './overview.js';
import epochRoutes from './epoch.js';
import notifyRoutes from './notify.js';

import { startCollectionsJob } from './collections.js';
import { startEpochCheckJob } from './epochCheck.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

const FRONTEND_URL = process.env.FRONTEND_URL; // e.g. https://yourusername.github.io
app.use(cors({
  origin: FRONTEND_URL ? FRONTEND_URL : '*', // falls back to * only if you haven't set FRONTEND_URL yet
  methods: ['GET','POST','PATCH','PUT','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization']
}));
app.use(express.json({ limit: '10mb' }));

app.get('/', (req, res) => res.json({ name: 'TerritoryX API', version: '1.0.0', status: 'operational' }));
app.get('/health', (req, res) => res.json({ status: 'ok', supabase: !!supabaseAdmin }));

app.use('/api/admin/credit', verifyJWT, requireAdmin, creditRoutes);
app.use('/api/admin/users', verifyJWT, requireAdmin, usersRoutes);
app.use('/api/admin/invoices', verifyJWT, requireAdmin, invoicesRoutes);
app.use('/api/admin/overview', verifyJWT, requireAdmin, overviewRoutes);
app.use('/api/admin/epoch', verifyJWT, requireAdmin, epochRoutes);
app.use('/api/notify', verifyJWT, notifyRoutes); // logged-in users only (not admin-only — applicants trigger their own admin-alert)

app.get('/api/invoices/:invoiceId/pdf', verifyJWT, async (req, res) => {
  const { invoiceId } = req.params;
  try {
    const { data: invoice } = await supabaseAdmin.from('invoices').select('*').eq('invoice_id', invoiceId).single();
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    // Owner or admin only
    const role = req.user?.app_metadata?.role;
    if (invoice.user_id !== req.user.id && role !== 'admin') {
      return res.status(403).json({ error: 'Not your invoice' });
    }
    const { generateInvoicePDF } = await import('./invoicePdf.js');
    const pdf = await generateInvoicePDF(invoice); // PDFKit generation is async (stream-based)
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${invoice.invoice_number || invoiceId}.pdf"`);
    res.send(pdf);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`🚀 TerritoryX API running on port ${PORT}`);
  startCollectionsJob();
  startEpochCheckJob();
});
