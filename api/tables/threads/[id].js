// /api/tables/threads/[id].js
import { supabase } from '../../_supabase.js'; // 既存パスに合わせてください

export default async function handler(req, res) {
  try {
    const id = req.url.split('/').pop(); // /api/tables/threads/<id>
    if (!id) return res.status(400).json({ error: 'missing id' });

    const sb = supabase();

    // まず対象を取得
    const { data: thread, error: getErr } = await sb
      .from('threads')
      .select('*')
      .eq('id', id)
      .single();
    if (getErr) return res.status(404).json({ error: 'not found' });

    if (req.method === 'GET') {
      return res.status(200).json(thread);
    }

    if (req.method === 'PATCH') {
      const body = typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
      const { user_fingerprint, ...fields } = body;

      // 所有チェック
      if (!user_fingerprint || user_fingerprint !== thread.user_fingerprint) {
        return res.status(403).json({ error: 'forbidden' });
      }

      // 更新可能なフィールドをホワイトリスト
      const updatable = {};
      ['title','content','category','subcategory','hashtags','images'].forEach(k=>{
        if (k in fields) updatable[k] = fields[k];
      });

      const { data, error } = await sb
        .from('threads')
        .update(updatable)
        .eq('id', id)
        .select()
        .single();

      if (error) return res.status(400).json({ error: error.message });
      return res.status(200).json({ data });
    }

    if (req.method === 'DELETE') {
      const body = typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
      const { user_fingerprint } = body;

      if (!user_fingerprint || user_fingerprint !== thread.user_fingerprint) {
        return res.status(403).json({ error: 'forbidden' });
      }

      const { error } = await sb.from('threads').delete().eq('id', id);
      if (error) return res.status(400).json({ error: error.message });
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'method not allowed' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message || 'server error' });
  }
}
