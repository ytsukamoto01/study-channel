// api/tables/[resource]/[id].js
import { supabase } from '../../_supabase.js';

export default async function handler(req, res) {
  try {
    const sb = supabase();

    // 1) Vercel標準: 動的パラメータは req.query に入る
    let { resource, id } = req.query || {};

    // 2) 念のためのフォールバック（rewrites後の絶対URLからも拾える）
    if (!resource || !id) {
      const url = new URL(req.url, `https://${req.headers.host}`);
      const segs = url.pathname.split('/').filter(Boolean); // ex) ['api','tables','threads','<id>']
      resource = resource || segs[2];
      id = id || segs[3];
    }

    if (!resource || !id) {
      return res.status(400).json({ error: 'missing resource or id' });
    }

    if (req.method === 'GET') {
      const { data, error } = await sb.from(resource).select('*').eq('id', id).single();
      if (error) throw error;
      return res.status(200).json(data);
    }

    if (req.method === 'PATCH') {
      const body = typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
      const { data, error } = await sb.from(resource).update(body).eq('id', id).select().single();
      if (error) throw error;
      return res.status(200).json(data);
    }

    if (req.method === 'DELETE') {
      const { error } = await sb.from(resource).delete().eq('id', id);
      if (error) throw error;
      return res.status(204).end();
    }

    return res.status(405).json({ error: 'method not allowed' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message || 'server error' });
  }
}
