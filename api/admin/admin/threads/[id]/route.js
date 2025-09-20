// /api/admin/threads/[id]/route.js
import { requireAdmin } from "../../../_lib/adminSession";
import { supabaseAdmin } from "../../../_lib/supabaseAdmin";

export async function PUT(request, { params }) {
  if (!requireAdmin()) return new Response("Unauthorized", { status: 401 });
  const id = params.id;
  const body = await request.json();
  const sb = supabaseAdmin();

  const patch = {
    title: body.title,
    content: body.content,
    category: body.category,
    subcategory: body.subcategory ?? null,
    hashtags: body.hashtags ?? [],
    images: body.images ?? [],
    author_name: "管理人",
    admin_mark: true, // 更新時も維持
  };

  const { data, error } = await sb.from("threads").update(patch).eq("id", id).select("*").single();
  if (error) return new Response(error.message, { status: 500 });
  return new Response(JSON.stringify(data), { status: 200 });
}

export async function DELETE(_request, { params }) {
  if (!requireAdmin()) return new Response("Unauthorized", { status: 401 });
  const id = params.id;
  const sb = supabaseAdmin();
  const { error } = await sb.from("threads").delete().eq("id", id);
  if (error) return new Response(error.message, { status: 500 });
  return new Response(JSON.stringify({ ok: true }), { status: 200 });
}
