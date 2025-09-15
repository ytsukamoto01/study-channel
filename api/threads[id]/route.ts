// app/api/threads/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";           // ← EdgeでなくNodeを強制
export const dynamic = "force-dynamic";    // ← キャッシュ無効

function reqError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function getEnvOrThrow(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

// anon で所有者を確認
async function fetchOwnerById(anon: ReturnType<typeof createClient>, id: string) {
  const { data, error } = await anon
    .from("threads")
    .select("id, user_fingerprint")
    .eq("id", id)
    .limit(1);
  if (error) throw new Error(`select failed: ${error.message}`);
  if (!data || data.length === 0) return null;
  return data[0] as { id: string; user_fingerprint: string | null };
}

// PATCH: 編集
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const id = params?.id;
    if (!id) return reqError("Missing id", 400);

    const supabaseUrl = getEnvOrThrow("NEXT_PUBLIC_SUPABASE_URL");
    const anonKey     = getEnvOrThrow("NEXT_PUBLIC_SUPABASE_ANON_KEY");
    const svcKey      = getEnvOrThrow("SUPABASE_SERVICE_ROLE_KEY");

    const payload = await req.json().catch(() => ({}));
    const {
      user_fingerprint,
      title,
      content,
      category,
      subcategory = null,
      hashtags = null,
      images = null,
    } = payload ?? {};

    if (!user_fingerprint) return reqError("user_fingerprint required", 400);

    // 1) anonで所有者確認
    const anon = createClient(supabaseUrl, anonKey);
    const row = await fetchOwnerById(anon, id);
    if (!row) return reqError("Not found", 404);
    if (row.user_fingerprint !== user_fingerprint) return reqError("Forbidden", 403);

    // 2) service_role で更新
    const svc = createClient(supabaseUrl, svcKey);
    const { data, error } = await svc
      .from("threads")
      .update({ title, content, category, subcategory, hashtags, images })
      .eq("id", id)
      .select()
      .maybeSingle();

    if (error) return reqError(`update failed: ${error.message}`, 500);
    return NextResponse.json({ ok: true, data });
  } catch (e: any) {
    // ここに来るのは主に env 未設定かライブラリエラー
    return reqError(`server error: ${e?.message ?? String(e)}`, 500);
  }
}

// DELETE: 削除
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const id = params?.id;
    if (!id) return reqError("Missing id", 400);

    const supabaseUrl = getEnvOrThrow("NEXT_PUBLIC_SUPABASE_URL");
    const anonKey     = getEnvOrThrow("NEXT_PUBLIC_SUPABASE_ANON_KEY");
    const svcKey      = getEnvOrThrow("SUPABASE_SERVICE_ROLE_KEY");

    // DELETE の body が空で届く環境があるため、クエリでも受ける
    const { searchParams } = new URL(req.url);
    const fpFromQuery = searchParams.get("fp");
    let fp = fpFromQuery;

    if (!fp) {
      try {
        const body = await req.json();
        fp = body?.user_fingerprint;
      } catch {
        // body なし
      }
    }
    if (!fp) return reqError("user_fingerprint required (query ?fp=... or JSON body)", 400);

    // 1) anonで所有者確認
    const anon = createClient(supabaseUrl, anonKey);
    const row = await fetchOwnerById(anon, id);
    if (!row) return reqError("Not found", 404);
    if (row.user_fingerprint !== fp) return reqError("Forbidden", 403);

    // 2) service_role で削除
    const svc = createClient(supabaseUrl, svcKey);
    const { error } = await svc.from("threads").delete().eq("id", id);
    if (error) return reqError(`delete failed: ${error.message}`, 500);

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return reqError(`server error: ${e?.message ?? String(e)}`, 500);
  }
}
