import cron from 'node-cron';
import { supabaseAdmin } from './supabase.js';

export function startCollectionsJob() {
  cron.schedule('0 * * * *', async () => {
    console.log('[CRON] Collections check');
    try {
      const now = new Date();
      const { data: overdue } = await supabaseAdmin
        .from('invoices').select('*')
        .eq('status', 'ISSUED').lt('due_date', now.toISOString());
      for (const inv of (overdue || [])) {
        const lateFee = Math.floor(inv.total * 0.015);
        await supabaseAdmin.from('invoices').update({
          status: 'OVERDUE', late_fee_applied: (inv.late_fee_applied || 0) + lateFee,
          total: inv.total + lateFee, balance_due: (inv.balance_due || inv.total) + lateFee
        }).eq('invoice_id', inv.invoice_id);
      }
    } catch (e) { console.error('[CRON] Collections failed:', e); }
  });
}
