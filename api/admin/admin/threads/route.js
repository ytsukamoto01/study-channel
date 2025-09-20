// /api/admin/threads/route.js
import { requireAdmin } from "../../_lib/adminSession";
import { supabaseAdmin } from "../../_lib/supabaseAdmin";

export async function GET() {
  if (!requireAdmin()) return new Response("Unauthorized", { status: 401 });
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("threads")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return new Response(error.message, { status: 500 });
  return new Response(JSON.stringify(data), { status: 200 });
}

export async function POST(request) {
  if (!requireAdmin()) return new Response("Unauthorized", { status: 401 });
  const payload = await request.json();
  const sb = supabaseAdmin();
  // 管理人投稿として admin_mark=true, author_name='管理人'
  const insert = {
    title: payload.title,
    content: payload.content,
    category: payload.category,
    subcategory: payload.subcategory ?? null,
    hashtags: payload.hashtags ?? [],
    images: payload.images ?? [],
    author_name: "管理人",
    user_fingerprint: null,
    admin_mark: true,
  };
  const { data, error } = await sb.from("threads").insert(insert).select("*").single();
  if (error) return new Response(error.message, { status: 500 });
  return new Response(JSON.stringify(data), { status: 201 });
}
