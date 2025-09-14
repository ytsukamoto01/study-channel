// GET /tables/threads?limit=100&sort=created_at&order=desc
// POST /tables/threads  (body: {title, content, category, subcategory?, hashtags?, images?, author_name?})
import { supabase, parseListParams } from '../_supabase.js';

export default async function handler(req, res) {
  try {
    const sb = supabase();

    if (req.method === 'GET') {
      const { limit, sort, order } = parseListParams(req);
      const { data, error } = await sb
        .from('threads')
        .select('*')
        .order(sort, { ascending: order === 'asc' })
        .limit(limit);
      if (error) throw error;
      return res.status(200).json({ data });
    }

      if (req.method === 'POST') {
        const body = typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
        const { title, content, category, subcategory, hashtags, images, author_name, user_fingerprint } = body;
        if (!title || !content || !category || !user_fingerprint) {
          return res.status(400).json({ error: 'missing required fields' });
      }
      // 簡易バリデーション
      if (!body.title || !body.content || !body.category) {
        return res.status(400).json({ error: 'missing fields' });
      }
      const payload = {
        title: body.title,
        content: body.content,
        category: body.category,
        subcategory: body.subcategory || null,
        hashtags: Array.isArray(body.hashtags) ? body.hashtags : null,
        images: Array.isArray(body.images) ? body.images : null,
        author_name: body.author_name || '匿名',
      };
      const { data, error } = await sb.from('threads').insert({title, content, category, subcategory, hashtags, images, author_name, user_fingerprint}).select().single();
      if (error) throw error;
      return res.status(200).json({ data });
    }

    return res.status(405).json({ error: 'method not allowed' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message || 'server error' });
  }
}
