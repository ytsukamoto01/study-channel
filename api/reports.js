// /api/reports.js - 通報・削除依頼API（完全版）
// - POST: 一般ユーザーが通報/削除依頼を作成
// - GET/PUT/DELETE: 管理画面向け（SERVICE_ROLE_KEY がある場合のみ許可）

import { createClient } from "@supabase/supabase-js";

// -------------------------------
// Supabase クライアント
// -------------------------------
function supabaseClientAdminOrAnon(method) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  if (!url) throw new Error("Server not configured: SUPABASE_URL");

  // 管理系（GET/PUT/DELETE）は service role を要求
  const needAdmin = method !== "POST";
  const srk = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

  if (needAdmin) {
    if (!srk) {
      // service role が無いなら管理操作をブロック（RLSで失敗する前に明示）
      return { sb: null, adminAllowed: false, reason: "SERVICE_ROLE_KEY missing" };
    }
    return {
      sb: createClient(url, srk, { auth: { persistSession: false } }),
      adminAllowed: true,
    };
  }

  // POST（一般）は anon でOK（reports には SELECT/INSERT を許可済み）
  if (!anon) throw new Error("Server not configured: SUPABASE_ANON_KEY");
  return {
    sb: createClient(url, anon, { auth: { persistSession: false } }),
    adminAllowed: false,
  };
}

// -------------------------------
/** 表示用：通報理由の日本語 */
const REASON_MAP = {
  spam: "スパム・宣伝",
  harassment: "誹謗中傷・嫌がらせ",
  inappropriate: "不適切な内容",
  false_info: "虚偽情報",
  other: "その他",
};

// -------------------------------
export default async function handler(req, res) {
  try {
    const { sb, adminAllowed, reason } = supabaseClientAdminOrAnon(req.method);
    if (!sb) {
      return res.status(403).json({ ok: false, error: `Admin endpoints require service role (${reason})` });
    }

    // ===========================
    // GET: 通報・削除依頼 一覧（管理）
    // ===========================
    if (req.method === "GET") {
      if (!adminAllowed) return res.status(403).json({ ok: false, error: "Forbidden" });

      const type = req.query.type ? String(req.query.type) : undefined;
      const status = req.query.status ? String(req.query.status) : undefined;
      const limit = Math.max(1, Math.min(200, parseInt(req.query.limit ?? "50", 10) || 50));
      const offset = Math.max(0, parseInt(req.query.offset ?? "0", 10) || 0);

      // 生成列+FKに合わせて埋め込み
      // reports.thread_ref   -> threads.id            (FK: reports_thread_ref_fkey)
      // reports.comment_ref  -> comments.id           (FK: reports_comment_ref_fkey)
      let query = sb
        .from("reports")
        .select(`
          *,
          target_thread:threads!reports_thread_ref_fkey(
            id, title, content, author_name, is_deleted, created_at
          ),
          target_comment:comments!reports_comment_ref_fkey(
            id, content, author_name, is_deleted, thread_id, created_at
          )
        `)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (type) query = query.eq("type", type);
      if (status) query = query.eq("status", status);

      const { data, error } = await query;
      if (error) {
        console.error("Reports fetch error:", error);
        return res.status(500).json({ ok: false, error: error.message });
      }

      // 統計（存在しない/権限なしでも落ちないようにガード）
      let stats = {};
      try {
        const { data: s, error: se } = await sb.rpc("get_reports_stats");
        if (!se && s) stats = s;
      } catch {}

      return res.status(200).json({
        ok: true,
        data: data || [],
        stats,
        pagination: { offset, limit, total: data?.length || 0 },
      });
    }

    // ===========================
    // POST: 通報/削除依頼（一般）
    // ===========================
    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;

      const {
        type, // 'report' | 'delete_request'
        target_type, // 'thread' | 'comment' | 'reply'
        target_id, // UUID
        reporter_fingerprint,
        reporter_name = "匿名",
        reason: reasonKey, // 'spam'|'harassment'|'inappropriate'|'false_info'|'other'
        description,
      } = body || {};

      // 入力バリデーション
      if (!type || !["report", "delete_request"].includes(type)) {
        return res.status(400).json({ ok: false, error: 'Invalid "type". Use "report" or "delete_request".' });
      }
      if (!target_type || !["thread", "comment", "reply"].includes(target_type)) {
        return res.status(400).json({ ok: false, error: 'Invalid "target_type". Use "thread" | "comment" | "reply".' });
      }
      if (!target_id) {
        return res.status(400).json({ ok: false, error: '"target_id" is required.' });
      }
      if (!reporter_fingerprint) {
        return res.status(400).json({ ok: false, error: '"reporter_fingerprint" is required.' });
      }
      if (!reasonKey || !Object.prototype.hasOwnProperty.call(REASON_MAP, reasonKey)) {
        return res
          .status(400)
          .json({ ok: false, error: 'Invalid "reason". Use one of ' + Object.keys(REASON_MAP).join(", ") });
      }

      // 対象の存在チェック
      // - reply は comments の行
      let existsError = null;
      if (target_type === "thread") {
        const { count, error } = await sb
          .from("threads")
          .select("id", { count: "exact", head: true })
          .eq("id", target_id)
          .limit(1);
        existsError = error || (count === 0 ? new Error("Target Not Found") : null);
      } else {
        const { count, error } = await sb
          .from("comments")
          .select("id", { count: "exact", head: true })
          .eq("id", target_id)
          .limit(1);
        existsError = error || (count === 0 ? new Error("Target Not Found") : null);
      }
      if (existsError) {
        return res.status(404).json({ ok: false, error: "Target Not Found" });
      }

      // 重複通報（同一ユーザ×同一対象×type）を抑止（DB側にも unique あり）
      if (reporter_fingerprint) {
        const { data: existing, error: exErr } = await sb
          .from("reports")
          .select("id", { head: false })
          .eq("type", type)
          .eq("target_type", target_type)
          .eq("target_id", target_id)
          .eq("reporter_fingerprint", reporter_fingerprint)
          .limit(1);

        if (!exErr && Array.isArray(existing) && existing.length > 0) {
          return res.status(400).json({
            ok: false,
            error: type === "report" ? "この投稿は既に通報済みです" : "この投稿は既に削除依頼済みです",
          });
        }
      }

      // 作成
      const { data, error } = await sb
        .from("reports")
        .insert({
          type,
          target_type,
          target_id,
          reporter_fingerprint,
          reporter_name,
          reason: reasonKey,
          description: description || null,
          status: "pending",
        })
        .select()
        .single();

      if (error) {
        console.error("Report creation error:", error);
        return res.status(500).json({ ok: false, error: error.message });
      }

      return res.status(201).json({
        ok: true,
        data,
        message: type === "report" ? "通報を受け付けました" : "削除依頼を受け付けました",
      });
    }

    // ===========================
    // PUT: ステータス変更（管理）
    // ===========================
    if (req.method === "PUT") {
      if (!adminAllowed) return res.status(403).json({ ok: false, error: "Forbidden" });

      const id = req.query.id ? String(req.query.id) : "";
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      const { status, admin_notes } = body || {};

      if (!id) return res.status(400).json({ ok: false, error: "ID is required" });
      if (!status || !["approved", "rejected", "pending"].includes(status)) {
        return res.status(400).json({ ok: false, error: 'Invalid status. Use "pending" | "approved" | "rejected".' });
      }

      const { data, error } = await sb
        .from("reports")
        .update({ status, admin_notes: admin_notes || null })
        .eq("id", id)
        .select()
        .single();

      if (error) {
        console.error("Report update error:", error);
        return res.status(500).json({ ok: false, error: error.message });
      }

      return res.status(200).json({
        ok: true,
        data,
        message: status === "approved" ? "承認しました" : status === "rejected" ? "拒否しました" : "保留に戻しました",
      });
    }

    // ===========================
    // DELETE: 通報レコード削除（管理）
    // ===========================
    if (req.method === "DELETE") {
      if (!adminAllowed) return res.status(403).json({ ok: false, error: "Forbidden" });

      const id = req.query.id ? String(req.query.id) : "";
      if (!id) return res.status(400).json({ ok: false, error: "ID is required" });

      const { error } = await sb.from("reports").delete().eq("id", id);
      if (error) {
        console.error("Report deletion error:", error);
        return res.status(500).json({ ok: false, error: error.message });
      }

      return res.status(200).json({ ok: true, message: "通報・削除依頼を削除しました" });
    }

    // その他
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  } catch (e) {
    console.error("UNHANDLED ERROR /api/reports:", e);
    return res.status(500).json({ ok: false, error: "Internal server error" });
  }
}
