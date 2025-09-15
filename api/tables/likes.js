// /api/tables/likes.js
import { supabase, parseListParams } from '../_supabase.js';

export default async function handler(req, res) {
  const sb = supabase(true);

  try {
    if (req.method === 'GET') {
      const { limit, sort, order } = parseListParams(req);
      const { data, error } = await sb
        .from('likes')
        .select('*')
        .order(sort, { ascending: order === 'asc' })
        .limit(limit);
      if (error) throw error;
      return res.status(200).json({ data });
    }

    if (req.method === 'POST') {
      let body = {};
      try {
        body = typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
      } catch {
        return res.status(400).json({ error: 'invalid json body' });
      }
      if (!body.target_type || !body.target_id || !body.user_fingerprint)
        return res.status(400).json({ error: 'missing fields' });

      const { data, error } = await sb.from('likes')
        .upsert(body, { onConflict: 'target_id,user_fingerprint' })
        .select()
        .single();
      if (error) throw error;
      return res.status(201).json({ data });
    }

    return res.status(405).json({ error: 'method not allowed' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message || 'server error' });
  }
}

