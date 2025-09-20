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
      const { error } = await sb.from("threads").delete().eq("id", id);
      if (error) { console.error("thread_delete error", error); return res.status(500).json({ ok:false, error: error.message }); }
      return res.status(200).json({ ok:true });
    }

    // ---- 通報・削除依頼管理機能 ----
    if (action === "reports_list") {
      const { type, status, limit = 50, offset = 0 } = payload || {};
      
      let query = sb
        .from('reports')
        .select(`
          *,
          target_thread:threads!reports_target_id_fkey(id, title, content, author_name),
          target_comment:comments!reports_target_id_fkey(id, content, author_name)
        `)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (type) query = query.eq('type', type);
      if (status) query = query.eq('status', status);

      const { data, error } = await query;
      if (error) { 
        console.error("reports_list error", error); 
        return res.status(500).json({ ok:false, error: error.message }); 
      }

      // 統計情報も取得
      const { data: stats } = await sb.rpc('get_reports_stats');

      return res.status(200).json({ 
        ok: true, 
        data: data || [],
        stats: stats || {}
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

      let deleteError = null;
      if (target_type === 'thread') {
        const { error } = await sb.from('threads').delete().eq('id', target_id);
        deleteError = error;
      } else if (target_type === 'comment') {
        const { error } = await sb.from('comments').delete().eq('id', target_id);
        deleteError = error;
      }

      if (deleteError) { 
        console.error("delete_reported_content error", deleteError); 
        return res.status(500).json({ ok:false, error: deleteError.message }); 
      }

      // 通報も承認済みに更新
      const { error: reportError } = await sb
        .from('reports')
        .update({ 
          status: 'approved', 
          admin_notes: '対象コンテンツを削除しました' 
        })
        .eq('id', id);

      if (reportError) { 
        console.error("report status update error", reportError); 
      }

      return res.status(200).json({ ok:true });
    }

    return res.status(400).json({ ok: false, error: "unknown action" });
  } catch (e) {
    console.error("UNHANDLED ERROR /api/admin:", e);
    return res.status(500).json({ ok: false, error: "internal error" });
  }
}


