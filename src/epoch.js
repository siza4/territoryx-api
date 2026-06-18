import { Router } from 'express';
import { supabaseAdmin } from './supabase.js';

const router = Router();

router.post('/settle', async (req, res) => {
  try {
    const { data: epoch } = await supabaseAdmin.from('epochs').select('*').eq('status', 'ACTIVE').single();
    if (!epoch) return res.status(400).json({ error: 'No active epoch' });

    const { data: territories } = await supabaseAdmin.from('territories').select('*');
    
    for (const t of (territories || [])) {
      const newBid = Math.max(Math.floor(t.bid * 0.1), 800);
      await supabaseAdmin.from('territories').update({
        bid: newBid, sudden: false, threat: 1, own_days: 0,
        brand: 'UNCLAIMED', color: '#666666'
      }).eq('id', t.id);
    }

    await supabaseAdmin.from('bids').update({ status: 'EXPIRED' }).eq('status', 'ACCEPTED');

    const newNum = (epoch.number || 0) + 1;
    const now = new Date();
    const ends = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    await supabaseAdmin.from('epochs').update({ status: 'CLOSED' }).eq('number', epoch.number);
    await supabaseAdmin.from('epochs').insert({
      number: newNum, name: 'EPOCH ' + String(newNum).padStart(2, '0'),
      status: 'ACTIVE', started_at: now.toISOString(), ends_at: ends.toISOString(),
      total_volume: 0, platform_toll: 0
    });

    return res.json({ settled: 0, newEpoch: { number: newNum, name: 'EPOCH ' + String(newNum).padStart(2, '0') } });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

export default router;
