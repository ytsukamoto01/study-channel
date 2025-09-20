// /api/admin/comments/[threadId].ts 例：スレッド＋コメントを一括取得(JSON)
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(_req: NextRequest, { params }: { params: { threadId: string }}) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY! // ←必ず service_role
  );

  const { data, error } = await supabase.rpc("admin_get_thread_full", {
    p_thread_id: params.threadId,
    p_include_deleted: true,
    p_order: "oldest"
  });

  if (error) return NextResponse.json({ ok:false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok:true, data });
}
