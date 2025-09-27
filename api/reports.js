// /api/reports.js - 通報・削除依頼API（完全版・承認時にカスケード/ハード削除対応）
import { createClient } from "@supabase/supabase-js";

// ---------- helpers ----------
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isUUID = (s) => typeof s === "string" && UUID_RE.test(s);

function supabaseClientAdminOrAnon(method) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  if (!url) throw new Error("Server not configured: SUPABASE_URL");

  const needAdmin = method !== "POST";
  const srk = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

  if (needAdmin) {
    if (!srk) return { sb: null, adminAllowed: false, reason: "SERVICE_ROLE_KEY missing" };
    return { sb: createClient(url, srk, { auth: { persistSession: false } }), adminAllowed: true };
  }
  if (!anon) throw new Error("Server not configured: SUPABASE_ANON_KEY");
  return { sb: createClient(url, anon, { auth: { persistSession: false } }), adminAllowed: false };
}

const REASON_MAP = {
  spam: "スパム・宣伝",
  harassment: "誹謗中傷・嫌がらせ",
  inappropriate: "不適切な内容",
  false_info: "虚偽情報",
  other: "その他",
};

// ============ handler ============
export default async function handler(req, res) {
  try {
    const { sb, adminAllowed, reason } = supabaseClientAdminOrAnon(req.method);
    if (!sb) {
      return res.status(403).json({ ok: false, error: `Admin endpoints require service role (${reason})` });
    }

    // ---------- GET: 一覧 ----------
    if (req.method === "GET") {
      const user_fingerprint = req.query.user_fingerprint ? String(req.query.user_fingerprint) : undefined;

      if (user_fingerprint && !adminAllowed) {
        const { data, error } = await sb
          .from("reports")
          .select(`id, type, target_type, target_id, status, reason, description, admin_notes, created_at, updated_at`)
          .eq("reporter_fingerprint", user_fingerprint)
          .order("created_at", { ascending: false });
        if (error) return res.status(500).json({ ok: false, error: error.message });
        return res.status(200).json({ ok: true, data: data || [], user_mode: true });
      }

      if (!adminAllowed) return res.status(403).json({ ok: false, error: "Forbidden" });

      const type = req.query.type ? String(req.query.type) : undefined;
      const status = req.query.status ? String(req.query.status) : undefined;
      const limit = Math.max(1, Math.min(200, parseInt(req.query.limit ?? "50", 10) || 50));
      const offset = Math.max(0, parseInt(req.query.offset ?? "0", 10) || 0);

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
      if (error) return res.status(500).json({ ok: false, error: error.message });

      let stats = {};
      try {
        const { data: s, error: se } = await sb.rpc("get_reports_stats");
        if (!se && s) stats = s;
      } catch {}
      return res.status(200).json({ ok: true, data: data || [], stats, pagination: { offset, limit, total: data?.length || 0 } });
    }

    // ---------- POST: 新規通報 ----------
    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      const { type, target_type, target_id, reporter_fingerprint, reporter_name = "匿名", reason: reasonKey, description } = body || {};

      if (!type || !["report", "delete_request"].includes(type)) {
        return res.status(400).json({ ok: false, error: 'Invalid "type". Use "report" or "delete_request".' });
      }
      if (!target_type || !["thread", "comment", "reply"].includes(target_type)) {
        return res.status(400).json({ ok: false, error: 'Invalid "target_type". Use "thread" | "comment" | "reply".' });
      }
      if (!target_id || !isUUID(target_id)) return res.status(400).json({ ok: false, error: '"target_id" must be uuid.' });
      if (!reporter_fingerprint) return res.status(400).json({ ok: false, error: '"reporter_fingerprint" is required.' });
      if (!reasonKey || !Object.prototype.hasOwnProperty.call(REASON_MAP, reasonKey)) {
        return res.status(400).json({ ok: false, error: 'Invalid "reason". Use one of ' + Object.keys(REASON_MAP).join(", ") });
      }

      // 対象存在チェック
      let existsError = null;
      if (target_type === "thread") {
        const { count, error } = await sb.from("threads").select("id", { count: "exact", head: true }).eq("id", target_id).limit(1);
        existsError = error || (count === 0 ? new Error("Target Not Found") : null);
      } else {
        const { count, error } = await sb.from("comments").select("id", { count: "exact", head: true }).eq("id", target_id).limit(1);
        existsError = error || (count === 0 ? new Error("Target Not Found") : null);
      }
      if (existsError) return res.status(404).json({ ok: false, error: "Target Not Found" });

      // 重複抑止
      const { data: existing, error: exErr } = await sb
        .from("reports")
        .select("id")
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
      if (error) return res.status(500).json({ ok: false, error: error.message });

      return res.status(201).json({ ok: true, data, message: type === "report" ? "通報を受け付けました" : "削除依頼を受け付けました" });
    }

    // ---------- PUT: ステータス変更（+ 任意で物理削除） ----------
    if (req.method === "PUT") {
      if (!adminAllowed) return res.status(403).json({ ok: false, error: "Forbidden" });

      const id = req.query.id ? String(req.query.id) : "";
      if (!id) return res.status(400).json({ ok: false, error: "ID is required" });

      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      const { status, admin_notes, delete_content = false, target_type: bodyType, target_id: bodyTid } = body || {};
      if (!status || !["approved", "rejected", "pending"].includes(status)) {
        return res.status(400).json({ ok: false, error: 'Invalid status. Use "pending" | "approved" | "rejected".' });
      }

      let contentDeleted = false;
      let reportDeleted = false;

      // 1) 承認かつコンテンツも削除する場合、先に対象を消す（FKでreportsごと消える可能性あり）
      if (status === "approved" && delete_content) {
        // ターゲットを取得（ボディ未指定ならレポートから）
        let ttype = bodyType;
        let tid = bodyTid;

        if (!ttype || !tid) {
          const { data: rep, error: repErr } = await sb
            .from("reports")
            .select("target_type, target_id")
            .eq("id", id)
            .single();
          if (repErr) return res.status(404).json({ ok: false, error: "Report not found" });
          ttype = rep?.target_type;
          tid = rep?.target_id;
        }

        const normalizedType = String(ttype || "").toLowerCase();
        if (!tid || !isUUID(tid)) return res.status(400).json({ ok: false, error: "Invalid target_id" });

        let p_target_type;
        if (["thread", "threads"].includes(normalizedType)) p_target_type = "thread";
        else if (["comment", "comments", "reply", "replies"].includes(normalizedType)) p_target_type = "comment";
        else return res.status(400).json({ ok: false, error: "unsupported target_type" });

        const { error: delErr } = await sb.rpc("admin_delete_content", { p_target_type, p_target_id: tid });
        if (delErr) return res.status(500).json({ ok: false, error: delErr.message });
        contentDeleted = true;
      }

      // 2) レポート行の更新（※1でFKにより消えていたら 404 を成功扱いにする）
      {
        const { data, error } = await sb
          .from("reports")
          .update({ status, admin_notes: admin_notes || null })
          .eq("id", id)
          .select()
          .single();

        if (error) {
          // 通常は 406 Not Acceptable 系だが、行が消えているケースもある
          // その場合、approve+delete_content の結果、FK CASCADEで消えたと判断
          reportDeleted = (status === "approved" && delete_content);
        }

        if (!error && !data && status === "approved" && delete_content) {
          reportDeleted = true; // 念のため
        }

        // 成功パス（行が残っている or 消えている）いずれもOKで返す
        return res.status(200).json({
          ok: true,
          data: reportDeleted ? null : (data || null),
          message:
            status === "approved"
              ? (delete_content ? "承認し、対象を削除しました" : "承認しました")
              : status === "rejected"
                ? "拒否しました"
                : "保留に戻しました",
          content_deleted: contentDeleted,
          report_deleted: reportDeleted,
        });
      }
    }

    // ---------- DELETE: レポート行削除 ----------
    if (req.method === "DELETE") {
      if (!adminAllowed) return res.status(403).json({ ok: false, error: "Forbidden" });

      const id = req.query.id ? String(req.query.id) : "";
      if (!id) return res.status(400).json({ ok: false, error: "ID is required" });

      const { error } = await sb.from("reports").delete().eq("id", id);
      if (error) return res.status(500).json({ ok: false, error: error.message });
      return res.status(200).json({ ok: true, message: "通報・削除依頼を削除しました" });
    }

    return res.status(405).json({ ok: false, error: "Method not allowed" });
  } catch (e) {
    console.error("UNHANDLED ERROR /api/reports:", e);
    return res.status(500).json({ ok: false, error: "Internal server error" });
  }
}
