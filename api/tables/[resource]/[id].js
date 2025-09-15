// /api/tables/[resource]/[id].js
import { supabase } from '../../../_supabase.js';

export default async function handler(req, res) {
  const sb = supabase(true); // Use service role for all operations to bypass RLS

  try {
    const { resource, id } = req.query;
    if (!resource || !id) return res.status(400).json({ error: 'missing params' });

    const { data: record, error: getErr } = await sb.from(resource).select('*').eq('id', id).maybeSingle();
    if (getErr || !record) return res.status(404).json({ error: 'not found' });

    if (req.method === 'GET') return res.status(200).json({ data: record });

    let body = {};
    try {
      body = typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
    } catch {
      return res.status(400).json({ error: 'invalid json body' });
    }

    const { user_fingerprint, ...fields } = body;
    if (!user_fingerprint || user_fingerprint !== record.user_fingerprint)
      return res.status(403).json({ error: 'forbidden' });

    if (req.method === 'PATCH') {
      const updatable = {};
      ['title','content','category','subcategory','hashtags','images'].forEach(k => {
        if (k in fields) updatable[k] = fields[k];
      });
      const { data, error } = await sb.from(resource).update(updatable).eq('id', id).select().single();
      if (error) return res.status(400).json({ error: error.message });
      return res.status(200).json({ data });
    }

    if (req.method === 'DELETE') {
      const { error } = await sb.from(resource).delete().eq('id', id);
      if (error) return res.status(400).json({ error: error.message });
      return res.status(204).end();
    }

    return res.status(405).json({ error: 'method not allowed' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message || 'server error' });
  }
}

