// /api/admin/logout/route.js
import { clearAdminSessionCookie } from "../../_lib/adminSession";

export async function POST() {
  clearAdminSessionCookie();
  return new Response(JSON.stringify({ ok: true }), { status: 200 });
}
