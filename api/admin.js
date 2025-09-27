// /api/admin.js  (ESM)
import crypto, { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import { createClient } from "@supabase/supabase-js";
import Busboy from "busboy";

// -------------------------
// Constants & Config
// -------------------------
const COOKIE_NAME = "sc_admin_session";
const MAX_AGE_SEC = 60 * 60 * 12;
const BUCKET = process.env.SUPABASE_BUCKET || "admin-uploads";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY; // Service Role 必須
const SESSION_SECRET = process.env.SESSION_SECRET;
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("[ENV] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing");
}
if (!SESSION_SECRET) {
  console.error("[ENV] SESSION_SECRET missing");
}
if (!ADMIN_PASSWORD_HASH) {
  console.error("[ENV] ADMIN_PASSWORD_HASH missing");
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

// UUID 厳格チェック（DB側は uuid 型なので二重で安全）
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isUUID = (s) => typeof s === "string" && UUID_RE.test(s);

// -------------------------
// Helpers
// -------------------------
function sign(v, secret) {
  const h = crypto.createHmac("sha256", secret).update(v).digest("hex");
  return `${v}.${h}`;
}
function verify(sig, secret) {
  const [v, h] = (sig || "").split(".");
  if (!v || !h) return null;
  const chk = crypto.createHmac("sha256", secret).update(v).digest("hex");
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
  if (!found || !SESSION_SECRET) return false;
  const raw = verify(found.split("=")[1], SESSION_SECRET);
  if (!raw) return false;
  try { return !!JSON.parse(raw).admin; } catch { return false; }
}

function json(res, code, body) {
  res.statusCode = code;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

async function readJsonBody(req) {
  return new Promise((resolve) => {
    let s = "";
    req.on("data", (c) => (s += c));
    req.on("end", () => {
      try { resolve(s ? JSON.parse(s) : {}); } catch { resolve({}); }
    });
  });
}

async function ensureBucket(sb) {
  const { data: got } = await sb.storage.getBucket(BUCKET);
  if (got) return;
  const { error } = await sb.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: "10MB",
    allowedMimeTypes: ["image/*"],
  });
  if (error) {
    console.error("createBucket error", error);
    throw new Error("cannot create bucket");
  }
}

function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const bb = Busboy({ headers: req.headers });
    const files = [];
    const fields = {};
    bb.on("file", (_name, stream, info) => {
      const { filename, mimeType } = info;
      const chunks = [];
      stream.on("data", (d) => chunks.push(d));
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

// -------------------------
// Main Handler
// -------------------------
export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return json(res, 405, { ok: false, error: "method not allowed" });
    }

    const urlObj = new URL(req.url, `http://${req.headers.host}`);
    const isMultipart = (req.headers["content-type"] || "").startsWith("multipart/form-data");
    const queryAction = urlObj.searchParams.get("action");
    const body = isMultipart ? {} : (await readJsonBody(req));
    const action = isMultipart ? queryAction : body.action;
    const { password, id, payload } = body;

    // -------------------------
    // Public: diagnostics
    // -------------------------
    if (action === "diag") {
      const missing = [];
      if (!ADMIN_PASSWORD_HASH) missing.push("ADMIN_PASSWORD_HASH");
      if (!SESSION_SECRET) missing.push("SESSION_SECRET");
      if (!SUPABASE_URL) missing.push("SUPABASE_URL");
      if (!SERVICE_KEY) missing.push("SUPABASE_SERVICE_ROLE_KEY");
      return json(res, missing.length ? 500 : 200, { ok: missing.length === 0, missing });
    }

    // -------------------------
    // Public: login / logout
    // -------------------------
    if (action === "login") {
      if (!ADMIN_PASSWORD_HASH || !SESSION_SECRET) {
        console.error("[ENV MISSING] login", { hasHash: !!ADMIN_PASSWORD_HASH, hasSecret: !!SESSION_SECRET });
        return json(res, 500, { ok: false, error: "server not configured" });
      }
      const ok = await bcrypt.compare(password ?? "", ADMIN_PASSWORD_HASH).catch(() => false);
      if (!ok) return json(res, 401, { ok: false });

      const cookieVal = sign(JSON.stringify({ admin: true, iat: Date.now() }), SESSION_SECRET);
      const cookie = `${COOKIE_NAME}=${cookieVal}; HttpOnly; Secure; Path=/; SameSite=Lax; Max-Age=${MAX_AGE_SEC}`;
      res.setHeader("Set-Cookie", cookie);
      return json(res, 200, { ok: true });
    }

    if (action === "logout") {
      res.setHeader(
        "Set-Cookie",
        `${COOKIE_NAME}=; HttpOnly; Secure; Path=/; SameSite=Lax; Max-Age=0`
      );
      return json(res, 200, { ok: true });
    }

    // 認証必須アクション
    if (!isAdmin(req)) return json(res, 401, { ok: false, error: "unauthorized" });

    await ensureBucket(supabase);

    // -------------------------
    // Upload image (multipart)
    // -------------------------
    if (action === "upload_image") {
      if (!isMultipart) return json(res, 400, { ok: false, error: "multipart/form-data required" });

      const { files } = await parseMultipart(req);
      if (!files.length) return json(res, 400, { ok: false, error: "no files" });

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

        const { error: upErr } = await supabase.storage.from(BUCKET).upload(key, f.buffer, {
          contentType: f.mimeType || "application/octet-stream",
          upsert: false,
        });
        if (upErr) {
          console.error("storage.upload error", upErr);
          return json(res, 500, { ok: false, error: upErr.message });
        }
        const { data } = supabase.storage.from(BUCKET).getPublicUrl(key);
        uploaded.push({ path: key, url: data.publicUrl });
      }
      return json(res, 200, { ok: true, files: uploaded });
    }

    // -------------------------
    // Threads CRUD
    // -------------------------
    if (action === "threads_list") {
      const { data, error } = await supabase
        .from("threads")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) {
        console.error("threads_list error", error);
        return json(res, 500, { ok: false, error: error.message });
      }
      return json(res, 200, { ok: true, data });
    }

    if (action === "thread_create") {
      const p = payload || {};
      const ins = {
        title: p.title,
        content: p.content,
        category: p.category || "未分類",
        subcategory: p.subcategory || null,
        hashtags: p.hashtags || [],
        images: p.images || [],
        author_name: "管理人",
        user_fingerprint: null,
        admin_mark: true,
      };
      const { data, error } = await supabase.from("threads").insert(ins).select("*").single();
      if (error) {
        console.error("thread_create error", error);
        return json(res, 500, { ok: false, error: error.message });
      }
      return json(res, 200, { ok: true, data });
    }

    if (action === "thread_update") {
      if (!id) return json(res, 400, { ok: false, error: "missing id" });
      const p = payload || {};
      const patch = {
        title: p.title,
        content: p.content,
        category: p.category || "未分類",
        subcategory: p.subcategory || null,
        hashtags: p.hashtags || [],
        images: p.images || [],
        author_name: "管理人",
        admin_mark: true,
      };
      const { data, error } = await supabase.from("threads").update(patch).eq("id", id).select("*").single();
      if (error) {
        console.error("thread_update error", error);
        return json(res, 500, { ok: false, error: error.message });
      }
      return json(res, 200, { ok: true, data });
    }

    // 🔥 HARD DELETE (cascade via FK)
    if (action === "thread_delete") {
      if (!id) return json(res, 400, { ok: false, error: "missing id" });
      if (!isUUID(id)) return json(res, 400, { ok: false, error: "INVALID_UUID" });

      // DB 側で FK による連鎖削除を実施
      const { error } = await supabase.rpc("admin_delete_thread", { p_thread_id: id });
      if (error) {
        console.error("thread_delete error", error);
        return json(res, 500, { ok: false, error: error.message });
      }
      return json(res, 200, { ok: true });
    }

    // -------------------------
    // Reports (list/update/delete) + delete_reported_content
    // -------------------------
    if (action === "reports_list") {
      const { type, status, limit = 50, offset = 0 } = payload || {};
      let query = supabase
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
        return json(res, 500, { ok: false, error: error.message });
      }

      // 統計は任意（関数が無い環境でも落ちないように）
      let stats = {};
      try {
        const { data: s, error: se } = await supabase.rpc("get_reports_stats");
        if (!se && s) stats = s;
      } catch {}
      return json(res, 200, { ok: true, data: data || [], stats });
    }

    if (action === "report_update") {
      if (!id) return json(res, 400, { ok: false, error: "missing id" });
      const p = payload || {};
      const { status: newStatus, admin_notes } = p;
      if (!newStatus || !["pending", "approved", "rejected"].includes(newStatus)) {
        return json(res, 400, { ok: false, error: "invalid status" });
      }
      const { data, error } = await supabase
        .from("reports")
        .update({ status: newStatus, admin_notes: admin_notes || null })
        .eq("id", id)
        .select()
        .single();
      if (error) {
        console.error("report_update error", error);
        return json(res, 500, { ok: false, error: error.message });
      }
      return json(res, 200, { ok: true, data });
    }

    if (action === "report_delete") {
      if (!id) return json(res, 400, { ok: false, error: "missing id" });
      const { error } = await supabase.from("reports").delete().eq("id", id);
      if (error) {
        console.error("report_delete error", error);
        return json(res, 500, { ok: false, error: error.message });
      }
      return json(res, 200, { ok: true });
    }

    if (action === "delete_reported_content") {
      if (!id) return json(res, 400, { ok: false, error: "missing id" });
      const { target_type, target_id } = payload || {};
      if (!target_type || !target_id) return json(res, 400, { ok: false, error: "missing target_type or target_id" });
      if (!isUUID(target_id)) return json(res, 400, { ok: false, error: "INVALID_UUID" });

      let rpc;
      if (["thread", "threads"].includes(String(target_type).toLowerCase())) {
        rpc = supabase.rpc("admin_delete_content", { p_target_type: "thread", p_target_id: target_id });
      } else if (["comment", "comments", "reply", "replies"].includes(String(target_type).toLowerCase())) {
        rpc = supabase.rpc("admin_delete_content", { p_target_type: "comment", p_target_id: target_id });
      } else {
        return json(res, 400, { ok: false, error: "unsupported target_type" });
      }
      const { error } = await rpc;
      if (error) {
        console.error("delete_reported_content error", error);
        return json(res, 500, { ok: false, error: error.message });
      }
      return json(res, 200, { ok: true });
    }

    // -------------------------
    // Comments: fetch tree / flat
    // -------------------------
    if (action === "thread_full") {
      const threadId = (payload && payload.thread_id) || id;
      if (!threadId) return json(res, 400, { ok: false, error: "missing thread_id" });
      const includeDeleted = payload?.include_deleted ?? true;
      const order = payload?.order || "oldest";

      const { data, error } = await supabase.rpc("admin_get_thread_full", {
        p_thread_id: threadId,
        p_include_deleted: includeDeleted,
        p_order: order,
      });
      if (error) {
        console.error("thread_full error", error);
        return json(res, 500, { ok: false, error: error.message });
      }
      return json(res, 200, { ok: true, data });
    }

    if (action === "comments_tree") {
      const threadId = (payload && payload.thread_id) || id;
      if (!threadId) return json(res, 400, { ok: false, error: "missing thread_id" });
      const includeDeleted = payload?.include_deleted ?? true;
      const order = payload?.order || "oldest";
      const limit = payload?.limit ?? 5000;
      const offset = payload?.offset ?? 0;

      const { data, error } = await supabase.rpc("admin_get_comment_tree", {
        p_thread_id: threadId,
        p_include_deleted: includeDeleted,
        p_order: order,
        p_limit: limit,
        p_offset: offset,
      });
      if (error) {
        console.error("comments_tree error", error);
        return json(res, 500, { ok: false, error: error.message });
      }
      return json(res, 200, { ok: true, data });
    }

    // -------------------------
    // Comments: update / soft-delete / restore / hard-delete / reparent / create
    // -------------------------
    if (action === "comment_update") {
      const cid = (payload && payload.id) || id;
      if (!cid) return json(res, 400, { ok: false, error: "missing id" });
      const content = payload?.content ?? "";
      const images  = payload?.images ?? null;

      const { data, error } = await supabase.rpc("admin_update_comment", {
        p_id: cid,
        p_content: content,
        p_images: images,
      });
      if (error) {
        console.error("comment_update error", error);
        return json(res, 500, { ok: false, error: error.message });
      }
      return json(res, 200, { ok: true, updated: data });
    }

    if (action === "comment_soft_delete") {
      const cid = (payload && payload.id) || id;
      if (!cid) return json(res, 400, { ok: false, error: "missing id" });
      const { data, error } = await supabase.rpc("admin_soft_delete_comment_text", { p_id: cid });
      if (error) {
        console.error("comment_soft_delete error", error);
        return json(res, 500, { ok: false, error: error.message });
      }
      return json(res, (data ? 200 : 404), { ok: !!data });
    }

    if (action === "comment_restore") {
      const cid = (payload && payload.id) || id;
      if (!cid) return json(res, 400, { ok: false, error: "missing id" });
      const { data, error } = await supabase.rpc("admin_restore_comment", { p_id: cid });
      if (error) {
        console.error("comment_restore error", error);
        return json(res, 500, { ok: false, error: error.message });
      }
      return json(res, (data ? 200 : 404), { ok: !!data });
    }

    if (action === "comment_hard_delete") {
      const cid = (payload && payload.id) || id;
      if (!cid) return json(res, 400, { ok: false, error: "missing id" });
      if (!isUUID(cid)) return json(res, 400, { ok: false, error: "INVALID_UUID" });

      const { error } = await supabase.rpc("admin_delete_comment", { p_comment_id: cid });
      if (error) {
        console.error("comment_hard_delete error", error);
        return json(res, 500, { ok: false, error: error.message });
      }
      return json(res, 200, { ok: true });
    }

    if (action === "comment_reparent") {
      const cid = (payload && payload.id) || id;
      if (!cid) return json(res, 400, { ok: false, error: "missing id" });
      const newParent = (payload && payload.new_parent_id) ?? null;

      const { data, error } = await supabase.rpc("admin_reparent_comment", {
        p_id: cid,
        p_new_parent: newParent,
      });
      if (error) {
        console.error("comment_reparent error", error);
        return json(res, 500, { ok: false, error: error.message });
      }
      return json(res, 200, { ok: true, moved: data });
    }

    if (action === "comment_create") {
      const threadId = payload?.thread_id;
      const parentId = payload?.parent_id || null;
      const content = payload?.content || "";
      const images = payload?.images || [];
      if (!threadId) return json(res, 400, { ok: false, error: "missing thread_id" });
      if (!content.trim()) return json(res, 400, { ok: false, error: "content is required" });

      const ins = {
        thread_id: threadId,
        parent_comment_id: parentId,
        content: content.trim(),
        images,
        author_name: "管理人",
        user_fingerprint: null,
        is_deleted: false,
      };
      const { data, error } = await supabase.from("comments").insert(ins).select("*").single();
      if (error) {
        console.error("comment_create error", error);
        return json(res, 500, { ok: false, error: error.message });
      }

      // スレッド側のカウント更新（存在すれば）
      try {
        await supabase.rpc("increment_comment_count", { thread_id: threadId });
      } catch (e) {
        // 失敗してもコメント作成は成功扱い
        console.warn("increment_comment_count warn:", e?.message || e);
      }

      return json(res, 200, { ok: true, data });
    }

    // -------------------------
    // Unknown
    // -------------------------
    return json(res, 400, { ok: false, error: "unknown action" });
  } catch (e) {
    console.error("UNHANDLED ERROR /api/admin:", e);
    return json(res, 500, { ok: false, error: "internal error" });
  }
}


