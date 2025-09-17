// /pages/api/favorites/toggle.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { threadId, userFingerprint } = req.body ?? {};
    if (!threadId || !userFingerprint) {
      return res.status(400).json({ error: 'threadId and userFingerprint are required' });
    }

    const { data, error } = await supabaseAdmin.rpc('toggle_favorite', {
      p_thread_id: threadId,
      p_user_fingerprint: userFingerprint,
    });
    if (error) return res.status(500).json({ error: error.message });

    // data は 'favorited' | 'unfavorited' | 'unchanged'
    return res.status(200).json({ ok: true, action: data });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message ?? 'Internal Error' });
  }
}
