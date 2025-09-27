// /api/tables/likes.js（フル置き換え）
// DBスキーマ: likes(thread_id uuid, comment_id uuid, user_fingerprint text, created_at timestamptz)
//  - スレッドのいいね:  thread_id に値、comment_id は null
//  - コメントのいいね: comment_id に値、thread_id は null
// 互換: リクエストは target_type ('thread'|'comment'|'reply') / target_id を受け取り、サーバ側で上記にマッピング

import { supabase, parseListParams } from '../_supabase.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isUUID = (s) => typeof s === 'string' && UUID_RE.test(s);

function normalizeTargetType(t) {
  const x = String(t || '').toLowerCase();
  if (x === 'thread' || x === 'threads') return 'thread';
  if (x === 'comment' || x === 'comments' || x === 'reply' || x === 'replies') return 'comment';
  return null;
}

export default async function handler(req, res) {
  try {
    // anonクライアント（SELECT/INSERT用）
    const db = supabase(false);
    // serviceロール（DELETEの一部で必要になる場合に備えて）
    const sdb = supabase(true);

    // ========== GET: 一覧/対象別取得 ==========
    if (req.method === 'GET') {
      const url = new URL(req.url, `http://${req.headers.host}`);

      // 推奨: thread_id か comment_id のどちらかで対象を絞る
      const threadId = url.searchParams.get('thread_id');
      const commentId = url.searchParams.get('comment_id');

      // 互換: target_type/target_id でも受ける
      const tTypeRaw = url.searchParams.get('target_type');
      const tId = url.searchParams.get('target_id');
      const tType = normalizeTargetType(tTypeRaw);

      const { limit, sort, order } = parseListParams(req);
      let q = db.from('likes').select('*');

      if (threadId) {
        if (!isUUID(threadId)) return res.status(400).json({ error: 'invalid thread_id' });
        q = q.eq('thread_id', threadId);
      } else if (commentId) {
        if (!isUUID(commentId)) return res.status(400).json({ error: 'invalid comment_id' });
        q = q.eq('comment_id', commentId);
      } else if (tType && tId) {
        if (!isUUID(tId)) return res.status(400).json({ error: 'invalid target_id' });
        q = tType === 'thread' ? q.eq('thread_id', tId) : q.eq('comment_id', tId);
      }
      q = q.order(sort || 'created_at', { ascending: (order || 'desc') === 'asc' }).limit(limit || 100);

      const { data, error } = await q;
      if (error) throw error;
      return res.status(200).json({ data: data || [] });
    }

    // ========== POST: いいね作成 ==========
    if (req.method === 'POST') {
      const body = typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
      const { target_type, target_id, user_fingerprint } = body || {};

      const tType = normalizeTargetType(target_type);
      if (!tType) return res.status(400).json({ error: 'invalid target_type (use "thread" or "comment|reply")' });
      if (!isUUID(target_id)) return res.status(400).json({ error: 'invalid target_id' });
      if (!user_fingerprint) return res.status(400).json({ error: 'user_fingerprint is required' });

      // 既存チェック（同一ユーザー・同一対象）
      let dup = db.from('likes').select('id').eq('user_fingerprint', user_fingerprint).limit(1);
      dup = tType === 'thread' ? dup.eq('thread_id', target_id) : dup.eq('comment_id', target_id);
      const { data: existing, error: dupErr } = await dup.maybeSingle();
      if (dupErr) throw dupErr;
      if (existing) {
        return res.status(409).json({ error: 'Already liked', message: 'このアイテムには既にいいねしています' });
      }

      // 対象レコードが存在するか軽く確認（オプション）
      if (tType === 'thread') {
        const { count, error: exErr } = await db.from('threads').select('id', { count: 'exact', head: true }).eq('id', target_id).limit(1);
        if (exErr) throw exErr;
        if (!count) return res.status(404).json({ error: 'thread not found' });
      } else {
        const { count, error: exErr } = await db.from('comments').select('id', { count: 'exact', head: true }).eq('id', target_id).limit(1);
        if (exErr) throw exErr;
        if (!count) return res.status(404).json({ error: 'comment not found' });
      }

      const row =
        tType === 'thread'
          ? { thread_id: target_id, comment_id: null, user_fingerprint }
          : { thread_id: null, comment_id: target_id, user_fingerprint };

      const { data, error } = await db.from('likes').insert(row).select().single();
      if (error) throw error;

      // （必要なら）集計を別RPCで更新する場合はここで呼ぶ
      // await db.rpc('increment_like_count', { ... });

      return res.status(201).json({ data });
    }

    // ========== DELETE: いいね削除 ==========
    if (req.method === 'DELETE') {
      const body = typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
      const { target_type, target_id, user_fingerprint } = body || {};

      const tType = normalizeTargetType(target_type);
      if (!tType) return res.status(400).json({ error: 'invalid target_type (use "thread" or "comment|reply")' });
      if (!isUUID(target_id)) return res.status(400).json({ error: 'invalid target_id' });
      if (!user_fingerprint) return res.status(400).json({ error: 'user_fingerprint is required' });

      let del = sdb.from('likes').delete().eq('user_fingerprint', user_fingerprint); // service roleならRLSでも安全
      del = tType === 'thread' ? del.eq('thread_id', target_id) : del.eq('comment_id', target_id);

      const { data, error } = await del.select();
      if (error) throw error;

      // （必要なら）集計を別RPCで更新する場合はここで呼ぶ
      // await sdb.rpc('decrement_like_count', { ... });

      return res.status(200).json({ data: data || [], message: 'Like removed successfully' });
    }

    // ========== その他 ==========
    res.setHeader('Allow', 'GET,POST,DELETE');
    return res.status(405).json({ error: 'method not allowed' });
  } catch (error) {
    console.error('Likes API Error:', error);
    return res.status(500).json({ error: 'Internal server error', message: error.message });
  }
}

