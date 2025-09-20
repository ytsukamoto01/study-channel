// /app/api/admin/route.ts
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { createClient } from "@supabase/supabase-js";

const COOKIE_NAME = "sc_admin_session";
const MAX_AGE_SEC = 60 * 60 * 12; // 12h

function supabaseAdmin() {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!url || !key) throw new Error("SUPABASE env missing");
  return createClient(url, key, { auth: { persistSession: false } });
}

function sign(value: string, secret: string) {
  const h = crypto.createHmac("sha256", secret).update(value).digest("hex");
  return `${value}.${h}`;
}
function verify(signed: string, secret: string) {
  const [value, sig] = signed.split(".");
  if (!value || !sig) return null;
  const check = crypto.createHmac("sha256", secret).update(value).digest("hex");
  const ok = crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(check));
  return ok ? value : null;
}

function isAdmin(req: NextRequest): boolean {
  const secret = process.env.SESSION_SECRET!;
  const c = req.cookies.get(COOKIE_NAME)?.value;
  if (!c) return false;
  try {
    const raw = verify(c, secret);
    if (!raw) return false;
    const obj = JSON.parse(raw);
    return !!obj.admin;
  } catch {
    return false;
  }
}

function setAdminCookie(res: NextResponse) {
  const secret = process.env.SESSION_SECRET!;
  const payload = JSON.stringify({ admin: true, iat: Date.now() });
  const signed = sign(payload, secret);
  res.cookies.set({
    name: COOKIE_NAME,
    value: signed,
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SEC,
  });
}

function clearAdminCookie(res: NextResponse) {
  res.cookies.set({
    name: COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export const dynamic = "force-dynamic"; // 常にServerlessでOK

export async function POST(req: NextRequest) {
  const sb = supabaseAdmin();
  const body = await req.json().catch(() => ({}));
  const action = body?.action as string | undefined;

  // ---- login ----
  if (action === "login") {
    const hash = process.env.ADMIN_PASSWORD_HASH!;
    if (!hash) return NextResponse.json({ ok: false, error: "server not configured" }, { status: 500 });
    const ok = await bcrypt.compare(body?.password ?? "", hash);
    if (!ok) return NextResponse.json({ ok: false }, { status: 401 });
    const res = NextResponse.json({ ok: true });
    setAdminCookie(res);
    return res;
  }

  // 以下は認証必須
  if (!isAdmin(req)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  // ---- logout ----
  if (action === "logout") {
    const res = NextResponse.json({ ok: true });
    clearAdminCookie(res);
    return res;
  }

  // ---- threads: list/create/update/delete ----
  if (action === "threads_list") {
    const { data, error } = await sb.from("threads").select("*").order("created_at", { ascending: false }).limit(200);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, data });
  }

  if (action === "thread_create") {
    const payload = body?.payload ?? {};
    const insert = {
      title: payload.title,
      content: payload.content,
      category: payload.category ?? "未分類",
      subcategory: payload.subcategory ?? null,
      hashtags: payload.hashtags ?? [],
      images: payload.images ?? [],
      author_name: "管理人",
      user_fingerprint: null,
      admin_mark: true,
    };
    const { data, error } = await sb.from("threads").insert(insert).select("*").single();
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, data });
  }

  if (action === "thread_update") {
    const id = body?.id as string;
    if (!id) return NextResponse.json({ ok: false, error: "missing id" }, { status: 400 });
    const payload = body?.payload ?? {};
    const patch = {
      title: payload.title,
      content: payload.content,
      category: payload.category ?? "未分類",
      subcategory: payload.subcategory ?? null,
      hashtags: payload.hashtags ?? [],
      images: payload.images ?? [],
      author_name: "管理人",
      admin_mark: true,
    };
    const { data, error } = await sb.from("threads").update(patch).eq("id", id).select("*").single();
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, data });
  }

  if (action === "thread_delete") {
    const id = body?.id as string;
    if (!id) return NextResponse.json({ ok: false, error: "missing id" }, { status: 400 });
    const { error } = await sb.from("threads").delete().eq("id", id);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false, error: "unknown action" }, { status: 400 });
}
