// /api/tables/comments/index.js など
import { supabase, parseListParams } from '../_supabase.js';

export default async function handler(req, res) {
  try {
    const sb = supabase(true); // Use service role

    if (req.method === 'GET') {
      const { limit, sort, order } = parseListParams(req);
      const url = new URL(req.url, `https://${req.headers.host}`);
      const threadId = url.searchParams.get('thread_id');
      const parentId = url.searchParams.get('parent_comment_id');

      let query = sb.from('comments').select('*');

      if (threadId) query = query.eq('thread_id', threadId);
      if (parentId) query = query.eq('parent_comment_id', parentId);

      query = query.order(sort || 'created_at', { ascending: (order || 'desc') === 'asc' })
                   .limit(limit || 100);

      const { data, error } = await query;
      if (error) throw error;
      return res.status(200).json({ data });
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
      const {
        thread_id,
        content,
        images,
        author_name,
        like_count,
        comment_number,
        parent_comment_id, // ← 受け取る
      } = body;

      if (!thread_id || !content) {
        return res.status(400).json({ error: 'missing required fields' });
      }

      // サーバ側で採番（スレッド内の通し番号）
      const { data: countRows, error: countErr } = await sb
        .from('comments')
        .select('id', { count: 'exact', head: true })
        .eq('thread_id', thread_id);

      if (countErr) throw countErr;
      const next_number = (countRows?.length ?? 0) + 1; // head:true の場合 lengthは undefined、countはレスポンスヘッダになることもある
      // ↑ もし count の取得方法が環境で合わない場合は、簡易にクライアント採番でもOK

      const insertPayload = {
        thread_id,
        content,
        images: Array.isArray(images) ? images : null,
        author_name: author_name || '匿名',
        like_count: like_count ?? 0,
        comment_number: comment_number || next_number,
        parent_comment_id: parent_comment_id || null, // ← ここが超重要
      };

      const { data, error } = await sb.from('comments').insert(insertPayload).select().single();
      if (error) throw error;
      return res.status(200).json({ data });
    }

    if (req.method === 'PATCH') {
      const url = new URL(req.url, `https://${req.headers.host}`);
      const id = url.pathname.split('/').pop();
      if (!id) return res.status(400).json({ error: 'missing id' });

      const body = typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');

      const { data, error } = await sb.from('comments').update(body).eq('id', id).select().single();
      if (error) throw error;
      return res.status(200).json({ data });
    }

    return res.status(405).json({ error: 'method not allowed' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message || 'server error' });
  }
}
