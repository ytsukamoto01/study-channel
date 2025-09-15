// GET /tables/threads?limit=100&sort=created_at&order=desc
// POST /tables/threads  (body: {title, content, category, subcategory?, hashtags?, images?, author_name?, user_fingerprint})
import { supabase, parseListParams } from '../_supabase.js';

export default async function handler(req, res) {
  try {
    const sb = supabase(true); // Use service role for consistent behavior

    if (req.method === 'GET') {
      const { limit, sort, order } = parseListParams(req);
      const url = new URL(req.url, `https://${req.headers.host}`);
      const fp = url.searchParams.get('user_fingerprint');

      let q = sb.from('threads')
        .select('*')
        .order(sort, { ascending: order === 'asc' })
        .limit(limit);

      if (fp) {
        q = q.eq('user_fingerprint', fp); // ← フィルタ追加
      }

      const { data, error } = await q;
      if (error) throw error;
      return res.status(200).json({ data });
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
      const { title, content, category, subcategory, hashtags, images, author_name, user_fingerprint } = body;

      if (!title || !content || !category || !user_fingerprint) {
        return res.status(400).json({ error: 'missing required fields' });
      }

      const payload = {
        title,
        content,
        category,
        subcategory: subcategory || null,
        hashtags: Array.isArray(hashtags) ? hashtags : null,
        images: Array.isArray(images) ? images : null,
        author_name: author_name || '匿名',
        user_fingerprint
      };

      const { data, error } = await sb.from('threads').insert(payload).select().single();
      if (error) throw error;
      return res.status(200).json({ data });
    }

    return res.status(405).json({ error: 'method not allowed' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message || 'server error' });
  }
}
