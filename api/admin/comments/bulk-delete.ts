// /api/admin/comments/bulk-delete.ts 例：一括ソフト削除/復元/ハード削除
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  const { ids, mode }:{ ids:string[], mode:"soft"|"restore"|"hard" } = await req.json();
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  let rpc = "admin_soft_delete_comments";
  if (mode === "restore") rpc = "admin_restore_comments";
  if (mode === "hard")    rpc = "admin_hard_delete_comments";

  const { data, error } = await supabase.rpc(rpc, { p_ids: ids });
  if (error) return NextResponse.json({ ok:false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok:true, affected: data });
}
