// /api/admin.js
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { createClient } = require("@supabase/supabase-js");

const COOKIE_NAME = "sc_admin_session";
const MAX_AGE_SEC = 60 * 60 * 12;

function supabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("[ENV] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing");
    throw new Error("Server not configured: SUPABASE");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

function sign(v, s){ const h=crypto.createHmac("sha256",s).update(v).digest("hex"); return `${v}.${h}`; }
function verify(sig,s){ const [v,h]=sig.split("."); if(!v||!h)return null; const chk=crypto.createHmac("sha256",s).update(v).digest("hex"); return crypto.timingSafeEqual(Buffer.from(h),Buffer.from(chk))?v:null; }
function isAdmin(req){
  const c = (req.headers.cookie||"").split(";").map(s=>s.trim()).find(x=>x.startsWith(`${COOKIE_NAME}=`));
  if(!c) return false;
  const secret = process.env.SESSION_SECRET;
  if (!secret) return false;
  const raw = verify(c.split("=")[1], secret);
  if(!raw) return false;
  try { return !!JSON.parse(raw).admin; } catch { return false; }
}

module.exports = async (req, res) => {
  try {
    if (req.method !== "POST") return res.status(405).json({ ok:false, error:"method not allowed" });

    const body = typeof req.body === "string" ? JSON.parse(req.body||"{}") : (req.body||{});
    const { action, password, id, payload } = body;

    // ---- login ----
    if (action === "login") {
      const hash = process.env.ADMIN_PASSWORD_HASH;
      const secret = process.env.SESSION_SECRET;
      if (!hash) { console.error("[ENV] ADMIN_PASSWORD_HASH missing"); return res.status(500).json({ ok:false, error:"server not configured" }); }
      if (!secret){ console.error("[ENV] SESSION_SECRET missing"); return res.status(500).json({ ok:false, error:"server not configured" }); }

      const ok = await bcrypt.compare(password ?? "", hash).catch(e => { console.error("bcrypt.compare error", e); return false; });
      if (!ok) return res.status(401).json({ ok:false });

      const cookie = `${COOKIE_NAME}=${sign(JSON.stringify({admin:true, iat: Date.now()}), secret)}; HttpOnly; Secure; Path=/; SameSite=Lax; Max-Age=${MAX_AGE_SEC}`;
      res.setHeader("Set-Cookie", cookie);
      return res.status(200).json({ ok:true });
    }

    // 認証必須
    if (!isAdmin(req)) return res.status(401).json({ ok:false, error:"unauthorized" });

    // Supabase は認証後にだけ初期化
    const sb = supabaseAdmin();

    if (action === "logout") {
      res.setHeader("Set-Cookie", `${COOKIE_NAME}=; HttpOnly; Secure; Path=/; SameSite=Lax; Max-Age=0`);
      return res.status(200).json({ ok:true });
    }

    if (action === "threads_list") {
      const { data, error } = await sb.from("threads").select("*").order("created_at", { ascending: false }).limit(200);
      if (error) { console.error("threads_list error", error); return res.status(500).json({ ok:false, error: error.message }); }
      return res.status(200).json({ ok:true, data });
    }

    if (action === "thread_create") {
      const p = payload || {};
      const ins = { title:p.title, content:p.content, category:p.category||"未分類", subcategory:p.subcategory||null, hashtags:p.hashtags||[], images:p.images||[], author_name:"管理人", user_fingerprint:null, admin_mark:true };
      const { data, error } = await sb.from("threads").insert(ins).select("*").single();
      if (error) { console.error("thread_create error", error); return res.status(500).json({ ok:false, error: error.message }); }
      return res.status(200).json({ ok:true, data });
    }

    if (action === "thread_update") {
      if (!id) return res.status(400).json({ ok:false, error:"missing id" });
      const p = payload || {};
      const patch = { title:p.title, content:p.content, category:p.category||"未分類", subcategory:p.subcategory||null, hashtags:p.hashtags||[], images:p.images||[], author_name:"管理人", admin_mark:true };
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

    return res.status(400).json({ ok:false, error:"unknown action" });
  } catch (e) {
    console.error("UNHANDLED ERROR /api/admin:", e);
    return res.status(500).json({ ok:false, error:"internal error" });
  }
};

