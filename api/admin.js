// /api/admin.js  (ESM)
import crypto, { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import { createClient } from "@supabase/supabase-js";
import Busboy from "busboy"; // ← 追加

const COOKIE_NAME = "sc_admin_session";
const MAX_AGE_SEC = 60 * 60 * 12;
// 先頭の定数の下あたりに追加
const BUCKET = process.env.SUPABASE_BUCKET || "admin-uploads";

async function ensureBucket(sb) {
  // 既存なら何もしない
  const { data: got } = await sb.storage.getBucket(BUCKET);
  if (got) return;

  // なければ作成（公開バケット）
  const { error: createErr } = await sb.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: "10MB",         // 任意：サイズ上限
    allowedMimeTypes: ["image/*"], // 任意：画像のみに制限
  });
  if (createErr) {
    console.error("createBucket error", createErr);
    throw new Error("cannot create bucket");
  }
}

function supabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("[ENV] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing");
    throw new Error("Server not configured: SUPABASE");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

function sign(v, s) {
  const h = crypto.createHmac("sha256", s).update(v).digest("hex");
  return `${v}.${h}`;
}
function verify(sig, s) {
  const [v, h] = (sig || "").split(".");
  if (!v || !h) return null;
  const chk = crypto.createHmac("sha256", s).update(v).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(h), Buffer.from(chk)) ? v : null;
  } catch {
    return null;
  }
}
function isAdmin(req) {
  const cookieHeader = req.headers.cookie || "";
  const found = cookieHeader
    .split(";")
    .map((s) => s.trim())
    .find((x) => x.startsWith(`${COOKIE_NAME}=`));
  if (!found) return false;
  const secret = process.env.SESSION_SECRET;
  if (!secret) return false;
  const raw = verify(found.split("=")[1], secret);
  if (!raw) return false;
  try {
    return !!JSON.parse(raw).admin;
  } catch {
    return false;
  }
}

// 追加: multipart/form-data をパースするユーティリティ
function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const bb = Busboy({ headers: req.headers });
    const files = [];
    const fields = {};
    bb.on("file", (_name, stream, info) => {
      const { filename, mimeType } = info;
      const chunks = [];
      stream.on("data", (d) => chunks.push(d));
      stream.on("limit", () => {
        // 任意: サイズ制限を入れるならここでエラーに
      });
      stream.on("end", () => {
        files.push({ filename, mimeType, buffer: Buffer.concat(chunks) });
      });
    });
    bb.on("field", (name, val) => { fields[name] = val; });
    bb.on("error", reject);
    bb.on("finish", () => resolve({ files, fields }));
    req.pipe(bb);
  });
}

// メインハンドラ
export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "method not allowed" });
    }

    // multipart のときは action をクエリで受けてもOK
    const urlObj = new URL(req.url, `http://${req.headers.host}`);
    const queryAction = urlObj.searchParams.get("action");

    const isMultipart = (req.headers["content-type"] || "").startsWith("multipart/form-data");
    let body = {};
    if (!isMultipart) {
      body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    }
    const action = isMultipart ? queryAction : body.action;
    const { password, id, payload } = body;

    // 診断
    if (action === "diag") {
      const missing = [];
      if (!process.env.ADMIN_PASSWORD_HASH) missing.push("ADMIN_PASSWORD_HASH");
      if (!process.env.SESSION_SECRET) missing.push("SESSION_SECRET");
      if (!process.env.SUPABASE_URL) missing.push("SUPABASE_URL");
      if (!process.env.SUPABASE_SERVICE_ROLE_KEY) missing.push("SUPABASE_SERVICE_ROLE_KEY");
      return res.status(missing.length ? 500 : 200).json({ ok: missing.length === 0, missing });
    }

    // ---- login ----
    if (action === "login") {
      const hash = process.env.ADMIN_PASSWORD_HASH;
      const secret = process.env.SESSION_SECRET;
      if (!hash || !secret) {
        console.error("[ENV MISSING]", { hasHash: !!hash, hasSecret: !!secret });
        return res.status(500).json({ ok: false, error: "server not configured" });
      }
      const ok = await bcrypt.compare(password ?? "", hash).catch((e) => {
        console.error("bcrypt.compare error", e);
        return false;
      });
      if (!ok) return res.status(401).json({ ok: false });

      const cookie = `${COOKIE_NAME}=${sign(JSON.stringify({ admin: true, iat: Date.now() }), secret)}; HttpOnly; Secure; Path=/; SameSite=Lax; Max-Age=${MAX_AGE_SEC}`;
      res.setHeader("Set-Cookie", cookie);
      return res.status(200).json({ ok: true });
    }

    // 認証必須
    if (!isAdmin(req)) return res.status(401).json({ ok: false, error: "unauthorized" });

    const sb = supabaseAdmin();
    await ensureBucket(sb); 

    // ---- 画像アップロード（新規）----
    if (action === "upload_image") {
      if (!isMultipart) {
        return res.status(400).json({ ok: false, error: "multipart/form-data required" });
      }
      const { files } = await parseMultipart(req);
      if (!files.length) {
        return res.status(400).json({ ok: false, error: "no files" });
      }

      const today = new Date();
      const y = today.getUTCFullYear();
      const m = String(today.getUTCMonth() + 1).padStart(2, "0");
      const d = String(today.getUTCDate()).padStart(2, "0");

      const uploaded = [];
      for (const f of files) {
        const orig = f.filename || "file";
        const extMatch = orig.match(/\.([a-zA-Z0-9]+)$/);
        const ext = (extMatch ? extMatch[1] : "bin").toLowerCase();
        const key = `${y}/${m}/${d}/${randomUUID()}.${ext}`;

        const { error: upErr } = await sb.storage.from(BUCKET).upload(key, f.buffer, {
          contentType: f.mimeType || "application/octet-stream",
          upsert: false,
        });
        if (upErr) {
          console.error("storage.upload error", upErr);
          return res.status(500).json({ ok: false, error: upErr.message });
        }
        const { data } = sb.storage.from(BUCKET).getPublicUrl(key);
        uploaded.push({ path: key, url: data.publicUrl });
      }

      return res.status(200).json({ ok: true, files: uploaded });
    }

    // ---- 既存の threads CRUD ----
    if (action === "threads_list") {
      const { data, error } = await sb.from("threads").select("*").order("created_at", { ascending: false }).limit(200);
      if (error) { console.error("threads_list error", error); return res.status(500).json({ ok:false, error: error.message }); }
      return res.status(200).json({ ok:true, data });
    }

    if (action === "thread_create") {
      const p = payload || {};
      const ins = {
        title: p.title,
        content: p.content,
        category: p.category || "未分類",
        subcategory: p.subcategory || null,
        hashtags: p.hashtags || [],
        images: p.images || [],            // ← アップロードURLを入れる
        author_name: "管理人",
        user_fingerprint: null,
        admin_mark: true,
      };
      const { data, error } = await sb.from("threads").insert(ins).select("*").single();
      if (error) { console.error("thread_create error", error); return res.status(500).json({ ok:false, error: error.message }); }
      return res.status(200).json({ ok:true, data });
    }

    if (action === "thread_update") {
      if (!id) return res.status(400).json({ ok:false, error:"missing id" });
      const p = payload || {};
      const patch = {
        title: p.title,
        content: p.content,
        category: p.category || "未分類",
        subcategory: p.subcategory || null,
        hashtags: p.hashtags || [],
        images: p.images || [],            // ← アップロードURLを入れる
        author_name: "管理人",
        admin_mark: true,
      };
      const { data, error } = await sb.from("threads").update(patch).eq("id", id).select("*").single();
      if (error) { console.error("thread_update error", error); return res.status(500).json({ ok:false, error: error.message }); }
      return res.status(200).json({ ok:true, data });
    }

    if (action === "thread_delete") {
      if (!id) return res.status(400).json({ ok:false, error:"missing id" });
      
      console.log("🗑️ HARD DELETE: Thread cascade delete requested for ID:", id, "Type:", typeof id);
      
      // 🔥 HARD DELETE カスケード削除機能（データベース軽量化）
      try {
        // 強化されたログ記録
        console.log("📞 Calling admin_soft_delete_thread_text (→ HARD DELETE) with p_id:", id);
        
        const { data: ok, error } = await sb.rpc("admin_soft_delete_thread_text", { p_id: String(id) });
        
        if (error) { 
          console.error("🚨 thread_delete HARD DELETE error:", error);
          console.error("🚨 Error details:", JSON.stringify(error, null, 2)); 
          return res.status(500).json({ ok:false, error: error.message }); 
        }
        
        if (ok !== true) {
          console.log("⚠️ Thread not found:", id);
          return res.status(404).json({ ok:false, error:"thread not found" });
        }
        
        console.log("✅ HARD DELETE: Thread and all related data permanently deleted:", id);
        return res.status(200).json({ ok:true });
        
      } catch (rpcError) {
        console.error("🚨 RPC call FAILED in hard delete mode:", rpcError);
        console.error("🚨 Stack trace:", rpcError.stack);
        return res.status(500).json({ ok:false, error: "Hard deletion failed: " + rpcError.message });
      }
    }

    // ---- 通報・削除依頼管理機能 ----
  if (action === "reports_list") {
    const { type, status, limit = 50, offset = 0 } = payload || {};
  
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
  
    if (type)   query = query.eq("type", type);
    if (status) query = query.eq("status", status);
  
    const { data, error } = await query;
    if (error) {
      console.error("reports_list error", error);
      return res.status(500).json({ ok: false, error: error.message });
    }
  
    // 統計（未定義でも落ちないようにフォールバック）
    let stats = {};
    try {
      const { data: s, error: se } = await sb.rpc("get_reports_stats");
      if (!se && s) stats = s;
    } catch {}
  
    return res.status(200).json({
      ok: true,
      data: data || [],
      stats
    });
  }


    if (action === "report_update") {
      if (!id) return res.status(400).json({ ok:false, error:"missing id" });
      const p = payload || {};
      const { status: newStatus, admin_notes } = p;

      if (!newStatus || !['pending', 'approved', 'rejected'].includes(newStatus)) {
        return res.status(400).json({ ok:false, error:"invalid status" });
      }

      const { data, error } = await sb
        .from('reports')
        .update({ 
          status: newStatus, 
          admin_notes: admin_notes || null 
        })
        .eq('id', id)
        .select()
        .single();

      if (error) { 
        console.error("report_update error", error); 
        return res.status(500).json({ ok:false, error: error.message }); 
      }

      return res.status(200).json({ ok:true, data });
    }

    if (action === "report_delete") {
      if (!id) return res.status(400).json({ ok:false, error:"missing id" });
      
      const { error } = await sb.from('reports').delete().eq('id', id);
      if (error) { 
        console.error("report_delete error", error); 
        return res.status(500).json({ ok:false, error: error.message }); 
      }

      return res.status(200).json({ ok:true });
    }

    // ---- 通報された投稿を削除 ----
    if (action === "delete_reported_content") {
      if (!id) return res.status(400).json({ ok:false, error:"missing id" });
      const { target_type, target_id } = payload || {};
      if (!target_type || !target_id) {
        return res.status(400).json({ ok:false, error:"missing target_type or target_id" });
      }
    
      // 🔥 HARD DELETE: 通報された投稿の物理削除
      console.log("🗑️ HARD DELETE: Reported content deletion -", target_type, target_id);
      
      let rpcCall;
      if (target_type === "thread") {
        rpcCall = sb.rpc("admin_soft_delete_thread_text", { p_id: target_id });
      } else if (target_type === "comment" || target_type === "reply") {
        rpcCall = sb.rpc("admin_soft_delete_comment_text", { p_id: target_id });
      } else {
        return res.status(400).json({ ok:false, error:"unsupported target_type" });
      }
    
      const { data: ok, error: rpcErr } = await rpcCall;
      if (rpcErr) {
        console.error("🚨 delete_reported_content HARD DELETE error", rpcErr);
        return res.status(500).json({ ok:false, error: rpcErr.message });
      }
    
      // RPCはboolean返却。false=該当なし
      if (ok !== true) {
        return res.status(404).json({ ok:false, error:"Target not found" });
      }
    
      // 注意: レポート自体も物理削除されているため、個別のステータス更新は不要
      console.log("✅ HARD DELETE: Reported content and all related data permanently deleted");
      // reportErr処理は不要（reports テーブルから物理削除済み）
    
      return res.status(200).json({ ok:true });
    }

        // ---- コメント/返信：ツリー取得（thread_full）----
    if (action === "thread_full") {
      const threadId = (payload && payload.thread_id) || id;
      if (!threadId) return res.status(400).json({ ok:false, error:"missing thread_id" });
      const includeDeleted = payload?.include_deleted ?? true;
      const order = payload?.order || "oldest";

      const { data, error } = await sb.rpc("admin_get_thread_full", {
        p_thread_id: threadId,
        p_include_deleted: includeDeleted,
        p_order: order
      });
      if (error) { console.error("thread_full error", error); return res.status(500).json({ ok:false, error: error.message }); }
      return res.status(200).json({ ok:true, data });
    }

    // ---- コメント/返信：フラット取得（必要なら）----
    if (action === "comments_tree") {
      const threadId = (payload && payload.thread_id) || id;
      if (!threadId) return res.status(400).json({ ok:false, error:"missing thread_id" });
      const includeDeleted = payload?.include_deleted ?? true;
      const order = payload?.order || "oldest";
      const limit = payload?.limit ?? 5000;
      const offset = payload?.offset ?? 0;

      const { data, error } = await sb.rpc("admin_get_comment_tree", {
        p_thread_id: threadId,
        p_include_deleted: includeDeleted,
        p_order: order,
        p_limit: limit,
        p_offset: offset
      });
      if (error) { console.error("comments_tree error", error); return res.status(500).json({ ok:false, error: error.message }); }
      return res.status(200).json({ ok:true, data });
    }

    // ---- コメント編集（本文・画像URL配列）----
    if (action === "comment_update") {
      const cid = (payload && payload.id) || id;
      if (!cid) return res.status(400).json({ ok:false, error:"missing id" });
      const content = payload?.content ?? "";
      const images  = payload?.images ?? null;

      const { data, error } = await sb.rpc("admin_update_comment", {
        p_id: cid,
        p_content: content,
        p_images: images
      });
      if (error) { console.error("comment_update error", error); return res.status(500).json({ ok:false, error: error.message }); }
      return res.status(200).json({ ok:true, updated: data });
    }

    // ---- コメントのソフト削除/復元/ハード削除 ----
    if (action === "comment_soft_delete") {
      const cid = (payload && payload.id) || id;
      if (!cid) return res.status(400).json({ ok:false, error:"missing id" });
      const { data: ok, error } = await sb.rpc("admin_soft_delete_comment_text", { p_id: cid });
      if (error) { console.error("comment_soft_delete error", error); return res.status(500).json({ ok:false, error: error.message }); }
      return res.status(ok ? 200 : 404).json({ ok: !!ok });
    }
    if (action === "comment_restore") {
      const cid = (payload && payload.id) || id;
      if (!cid) return res.status(400).json({ ok:false, error:"missing id" });
      const { data: ok, error } = await sb.rpc("admin_restore_comment", { p_id: cid });
      if (error) { console.error("comment_restore error", error); return res.status(500).json({ ok:false, error: error.message }); }
      return res.status(ok ? 200 : 404).json({ ok: !!ok });
    }
    if (action === "comment_hard_delete") {
      const cid = (payload && payload.id) || id;
      if (!cid) return res.status(400).json({ ok:false, error:"missing id" });
      const { data: ok, error } = await sb.rpc("admin_hard_delete_comment", { p_id: cid });
      if (error) { console.error("comment_hard_delete error", error); return res.status(500).json({ ok:false, error: error.message }); }
      return res.status(ok ? 200 : 404).json({ ok: !!ok });
    }

    // ---- 親付け替え（nullでルート化）----
    if (action === "comment_reparent") {
      const cid = (payload && payload.id) || id;
      if (!cid) return res.status(400).json({ ok:false, error:"missing id" });
      const newParent = (payload && payload.new_parent_id) ?? null;

      const { data, error } = await sb.rpc("admin_reparent_comment", {
        p_id: cid,
        p_new_parent: newParent
      });
      if (error) { console.error("comment_reparent error", error); return res.status(500).json({ ok:false, error: error.message }); }
      return res.status(200).json({ ok:true, moved: data });
    }

    // ---- 管理者コメント作成 ----
    if (action === "comment_create") {
      const threadId = payload?.thread_id;
      const parentId = payload?.parent_id || null;
      const content = payload?.content || "";
      const images = payload?.images || [];

      if (!threadId) return res.status(400).json({ ok:false, error:"missing thread_id" });
      if (!content.trim()) return res.status(400).json({ ok:false, error:"content is required" });

      // commentsテーブルに直接挿入
      const ins = {
        thread_id: threadId,
        parent_comment_id: parentId,
        content: content.trim(),
        images: images,
        author_name: "管理人",
        user_fingerprint: null,
        //admin_mark: true,
        is_deleted: false
      };

      const { data, error } = await sb.from("comments").insert(ins).select("*").single();
      if (error) { 
        console.error("comment_create error", error); 
        return res.status(500).json({ ok:false, error: error.message }); 
      }

      // スレッドのcomment_countを更新
      const { error: updateError } = await sb.rpc("increment_comment_count", { thread_id: threadId });
      if (updateError) {
        console.error("increment_comment_count error", updateError);
        // エラーがあってもコメント作成は成功とみなす
      }

      return res.status(200).json({ ok:true, data });
    }

    return res.status(400).json({ ok: false, error: "unknown action" });
  } catch (e) {
    console.error("UNHANDLED ERROR /api/admin:", e);
    return res.status(500).json({ ok: false, error: "internal error" });
  }
}


