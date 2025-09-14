import { supabase, parseListParams } from '../_supabase.js';

export default async function handler(req, res) {
  try {
    const sb = supabase();

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
      const body = req.body && typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
      if (!body.target_type || !body.target_id || !body.user_fingerprint) {
        return res.status(400).json({ error: 'missing fields' });
      }
      const { data, error } = await sb.from('likes').insert({
        target_type: body.target_type,
        target_id: body.target_id,
        user_fingerprint: body.user_fingerprint
      }).select().single();
      if (error) throw error;
      return res.status(201).json(data);
    }

    return res.status(405).json({ error: 'method not allowed' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message || 'server error' });
  }
}
