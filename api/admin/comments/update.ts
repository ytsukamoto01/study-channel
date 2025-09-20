// /api/admin/comments/update.ts 例：コメント編集
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  const { id, content, images } = await req.json();

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data, error } = await supabase.rpc("admin_update_comment", {
    p_id: id,
    p_content: content ?? "",
    p_images: images ?? null
  });

  if (error) return NextResponse.json({ ok:false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok:true, updated: data });
}
