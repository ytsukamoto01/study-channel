// 例: /tables/threads/xxxxxxxx-... （PATCHで reply_count/like_count 更新など）
import { supabase } from '../_supabase.js';

export default async function handler(req, res) {
  try {
    const sb = supabase();
    const url = new URL(req.url, `https://${req.headers.host}`);
    const [, , , id] = url.pathname.split('/'); // /api/tables/{resource}/{id}
    const resource = url.pathname.split('/')[3 - 1]; // threads or comments など
    // ※Vercel Functions で動かす簡易実装のため1ファイル共用

    if (!id) return res.status(400).json({ error: 'missing id' });

    if (req.method === 'GET') {
      const { data, error } = await sb.from(resource).select('*').eq('id', id).single();
      if (error) throw error;
      return res.status(200).json(data);
    }

    if (req.method === 'PATCH') {
      const body = req.body && typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
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
