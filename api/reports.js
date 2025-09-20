// /api/reports.js - 通報・削除依頼API
import { createClient } from "@supabase/supabase-js";

function supabaseClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.error("[ENV] SUPABASE_URL or SUPABASE_ANON_KEY missing");
    throw new Error("Server not configured: SUPABASE");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

// 通報理由の日本語マップ
const REASON_MAP = {
  'spam': 'スパム・宣伝',
  'harassment': '誹謗中傷・嫌がらせ',
  'inappropriate': '不適切な内容',
  'false_info': '虚偽情報',
  'other': 'その他'
};

export default async function handler(req, res) {
  try {
    const supabase = supabaseClient();

    if (req.method === 'GET') {
      // 通報・削除依頼一覧取得（管理者用）
      const { type, status, limit = 50, offset = 0 } = req.query;
      
      let query = supabase
        .from('reports')
        .select(`
          *,
          target_thread:threads!reports_target_id_fkey(id, title, content),
          target_comment:comments!reports_target_id_fkey(id, content)
        `)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (type) {
        query = query.eq('type', type);
      }
      if (status) {
        query = query.eq('status', status);
      }

      const { data, error } = await query;
      
      if (error) {
        console.error('Reports fetch error:', error);
        return res.status(500).json({ 
          ok: false, 
          error: error.message 
        });
      }

      // 統計情報も取得
      const { data: stats } = await supabase.rpc('get_reports_stats');

      return res.status(200).json({ 
        ok: true, 
        data: data || [],
        stats: stats || {},
        pagination: {
          offset,
          limit,
          total: data?.length || 0
        }
      });

    } else if (req.method === 'POST') {
      // 新しい通報・削除依頼の作成
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const { 
        type, 
        target_type, 
        target_id, 
        reporter_fingerprint, 
        reporter_name = '匿名',
        reason, 
        description 
      } = body;

      // バリデーション
      if (!type || !['report', 'delete_request'].includes(type)) {
        return res.status(400).json({ 
          ok: false, 
          error: 'Invalid type. Must be "report" or "delete_request"' 
        });
      }

      if (!target_type || !['thread', 'comment', 'reply'].includes(target_type)) {
        return res.status(400).json({ 
          ok: false, 
          error: 'Invalid target_type. Must be "thread", "comment", or "reply"' 
        });
      }

      if (!target_id) {
        return res.status(400).json({ 
          ok: false, 
          error: 'target_id is required' 
        });
      }

      if (!reason || !Object.keys(REASON_MAP).includes(reason)) {
        return res.status(400).json({ 
          ok: false, 
          error: 'Invalid reason. Must be one of: ' + Object.keys(REASON_MAP).join(', ')
        });
      }

      // 対象が存在するかチェック
      let targetExists = false;
      if (target_type === 'thread') {
        const { data: thread } = await supabase
          .from('threads')
          .select('id')
          .eq('id', target_id)
          .single();
        targetExists = !!thread;
      } else if (target_type === 'comment') {
        const { data: comment } = await supabase
          .from('comments')
          .select('id')
          .eq('id', target_id)
          .single();
        targetExists = !!comment;
      }

      if (!targetExists) {
        return res.status(404).json({ 
          ok: false, 
          error: 'Target not found' 
        });
      }

      // 同じユーザーによる重複通報をチェック
      if (reporter_fingerprint) {
        const { data: existing } = await supabase
          .from('reports')
          .select('id')
          .eq('target_id', target_id)
          .eq('reporter_fingerprint', reporter_fingerprint)
          .eq('type', type);

        if (existing && existing.length > 0) {
          return res.status(400).json({ 
            ok: false, 
            error: type === 'report' ? 'この投稿は既に通報済みです' : 'この投稿は既に削除依頼済みです'
          });
        }
      }

      // 通報・削除依頼を作成
      const { data, error } = await supabase
        .from('reports')
        .insert({
          type,
          target_type,
          target_id,
          reporter_fingerprint,
          reporter_name,
          reason,
          description: description || null
        })
        .select()
        .single();

      if (error) {
        console.error('Report creation error:', error);
        return res.status(500).json({ 
          ok: false, 
          error: error.message 
        });
      }

      return res.status(201).json({ 
        ok: true, 
        data,
        message: type === 'report' ? '通報を受け付けました' : '削除依頼を受け付けました'
      });

    } else if (req.method === 'PUT') {
      // 通報・削除依頼の処理（承認/拒否）- 管理者のみ
      const { id } = req.query;
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const { status, admin_notes } = body;

      if (!id) {
        return res.status(400).json({ 
          ok: false, 
          error: 'ID is required' 
        });
      }

      if (!status || !['approved', 'rejected'].includes(status)) {
        return res.status(400).json({ 
          ok: false, 
          error: 'Invalid status. Must be "approved" or "rejected"' 
        });
      }

      const { data, error } = await supabase
        .from('reports')
        .update({ 
          status, 
          admin_notes: admin_notes || null 
        })
        .eq('id', id)
        .select()
        .single();

      if (error) {
        console.error('Report update error:', error);
        return res.status(500).json({ 
          ok: false, 
          error: error.message 
        });
      }

      return res.status(200).json({ 
        ok: true, 
        data,
        message: status === 'approved' ? '承認しました' : '拒否しました'
      });

    } else if (req.method === 'DELETE') {
      // 通報・削除依頼の削除 - 管理者のみ
      const { id } = req.query;

      if (!id) {
        return res.status(400).json({ 
          ok: false, 
          error: 'ID is required' 
        });
      }

      const { error } = await supabase
        .from('reports')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('Report deletion error:', error);
        return res.status(500).json({ 
          ok: false, 
          error: error.message 
        });
      }

      return res.status(200).json({ 
        ok: true,
        message: '通報・削除依頼を削除しました'
      });

    } else {
      return res.status(405).json({ 
        ok: false, 
        error: 'Method not allowed' 
      });
    }

  } catch (e) {
    console.error('UNHANDLED ERROR /api/reports:', e);
    return res.status(500).json({ 
      ok: false, 
      error: 'Internal server error' 
    });
  }
}