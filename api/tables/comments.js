import { supabase, parseListParams } from '../_supabase.js';

export default async function handler(req, res) {
  try {
    const sb = supabase();

    if (req.method === 'GET') {
      const { limit, sort, order } = parseListParams(req);
      const { data, error } = await sb
        .from('comments')
        .select('*')
        .order(sort, { ascending: order === 'asc' })
        .limit(limit);
      if (error) throw error;
      return res.status(200).json({ data });
    }

    if (req.method === 'POST') {
      const body = req.body && typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
      if (!body.thread_id || !body.content) {
        return res.status(400).json({ error: 'missing fields' });
      }
      const payload = {
        thread_id: body.thread_id,
        content: body.content,
        images: Array.isArray(body.images) ? body.images : null,
        author_name: body.author_name || '匿名',
        like_count: body.like_count || 0,
        comment_number: body.comment_number || 0
      };
      const { data, error } = await sb.from('comments').insert(payload).select().single();
      if (error) throw error;
      return res.status(201).json(data);
    }

    return res.status(405).json({ error: 'method not allowed' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message || 'server error' });
  }
}
