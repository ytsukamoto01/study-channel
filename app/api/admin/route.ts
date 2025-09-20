// /app/api/admin/route.ts
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { createClient } from "@supabase/supabase-js";

const COOKIE_NAME = "sc_admin_session";
const MAX_AGE_SEC = 60 * 60 * 12;
export const dynamic = "force-dynamic";

function supabaseAdmin() {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false } });
}
function sign(v: string, s: string) {
  const h = crypto.createHmac("sha256", s).update(v).digest("hex");
  return `${v}.${h}`;
}
function verify(sig: string, s: string) {
  const [v, h] = sig.split(".");
  if (!v || !h) return null;
  const chk = crypto.createHmac("sha256", s).update(v).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(h), Buffer.from(chk)) ? v : null;
}
function isAdmin(req: NextRequest) {
  const c = req.cookies.get(COOKIE_NAME)?.value;
  if (!c) return false;
  const raw = verify(c, process.env.SESSION_SECRET!);
  if (!raw) return false;
  try { return !!JSON.parse(raw).admin; } catch { return false; }
}

export async function POST(req: NextRequest) {
  const sb = supabaseAdmin();
  const body = await req.json().catch(() => ({}));
  const action = body?.action as string | undefined;

  if (action === "login") {
    const ok = await bcrypt.compare(body?.password ?? "", process.env.ADMIN_PASSWORD_HASH!);
    if (!ok) return NextResponse.json({ ok: false }, { status: 401 });
    const res = NextResponse.json({ ok: true });
    const payload = JSON.stringify({ admin: true, iat: Date.now() });
    res.cookies.set({
      name: COOKIE_NAME,
      value: sign(payload, process.env.SESSION_SECRET!),
      httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: MAX_AGE_SEC,
    });
    return res;
  }

  if (!isAdmin(req)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  if (action === "logout") {
    const res = NextResponse.json({ ok: true });
    res.cookies.set({ name: COOKIE_NAME, value: "", httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 0 });
    return res;
  }

  if (action === "threads_list") {
    const { data, error } = await sb.from("threads").select("*").order("created_at", { ascending: false }).limit(200);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, data });
  }

  if (action === "thread_create") {
    const p = body?.payload ?? {};
    const ins = {
      title: p.title, content: p.content, category: p.category ?? "未分類",
      subcategory: p.subcategory ?? null, hashtags: p.hashtags ?? [], images: p.images ?? [],
      author_name: "管理人", user_fingerprint: null, admin_mark: true,
    };
    const { data, error } = await sb.from("threads").insert(ins).select("*").single();
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, data });
  }

  if (action === "thread_update") {
    const id = body?.id as string; if (!id) return NextResponse.json({ ok: false, error: "missing id" }, { status: 400 });
    const p = body?.payload ?? {};
    const patch = {
      title: p.title, content: p.content, category: p.category ?? "未分類",
      subcategory: p.subcategory ?? null, hashtags: p.hashtags ?? [], images: p.images ?? [],
      author_name: "管理人", admin_mark: true,
    };
    const { data, error } = await sb.from("threads").update(patch).eq("id", id).select("*").single();
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, data });
  }

  if (action === "thread_delete") {
    const id = body?.id as string; if (!id) return NextResponse.json({ ok: false, error: "missing id" }, { status: 400 });
    const { error } = await sb.from("threads").delete().eq("id", id);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false, error: "unknown action" }, { status: 400 });
}
