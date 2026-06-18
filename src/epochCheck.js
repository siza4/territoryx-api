import cron from 'node-cron';
import { supabaseAdmin } from './supabase.js';

export function startEpochCheckJob() {
  cron.schedule('*/5 * * * *', async () => {
    try {
      const { data: epoch } = await supabaseAdmin
        .from('epochs').select('*').eq('status', 'ACTIVE').single();
      if (epoch && new Date(epoch.ends_at) < new Date()) {
        console.log('[CRON] Epoch expired:', epoch.number);
      }
    } catch (e) { console.error('[CRON] Epoch check failed:', e); }
  });
}
