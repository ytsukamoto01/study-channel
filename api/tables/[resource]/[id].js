// /api/tables/[resource]/[id].js（安全版）
import { supabase } from '../../_supabase.js';

export default async function handler(req, res) {
  try {
    const sb = supabase();

    // 1) Vercelの動的パラメータ
    let { resource, id } = req.query || {};
    // 2) フォールバック
    if (!resource || !id) {
      const url = new URL(req.url, `https://${req.headers.host}`);
      const segs = url.pathname.split('/').filter(Boolean); // ['api','tables','threads','<id>']
      resource = resource || segs[2];
      id = id || segs[3];
    }
    if (!resource || !id) return res.status(400).json({ error: 'missing resource or id' });

    // まず対象を取得
    const { data: record, error: getErr } = await sb.from(resource).select('*').eq('id', id).single();
    if (getErr || !record) return res.status(404).json({ error: 'not found' });

    if (req.method === 'GET') {
      return res.status(200).json(record);
    }

    if (req.method === 'PATCH') {
      const body = typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
      const { user_fingerprint, ...fields } = body;

      // 所有チェック
      if (!user_fingerprint || user_fingerprint !== record.user_fingerprint) {
        return res.status(403).json({ error: 'forbidden' });
      }

      // 更新対象フィールドのホワイトリスト
      const updatable = {};
      ['title','content','category','subcategory','hashtags','images'].forEach(k => {
        if (k in fields) updatable[k] = fields[k];
      });

      const { data, error } = await sb.from(resource).update(updatable).eq('id', id).select().single();
      if (error) return res.status(400).json({ error: error.message });
      return res.status(200).json(data);
    }

    if (req.method === 'DELETE') {
      const body = typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
      const { user_fingerprint } = body;

      // 所有チェック
      if (!user_fingerprint || user_fingerprint !== record.user_fingerprint) {
        return res.status(403).json({ error: 'forbidden' });
      }

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
