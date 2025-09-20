// /api/admin/login/route.js (Next.js app router)
// pages/api なら export default function handler(req,res) で同様実装
import { setAdminSessionCookie } from "../../_lib/adminSession";
import bcrypt from "bcryptjs";

export async function POST(request) {
  const { password } = await request.json();
  const hash = process.env.ADMIN_PASSWORD_HASH;
  if (!hash) return new Response("Server not configured", { status: 500 });

  const ok = await bcrypt.compare(password || "", hash);
  if (!ok) return new Response(JSON.stringify({ ok: false }), { status: 401 });

  setAdminSessionCookie({ admin: true });
  return new Response(JSON.stringify({ ok: true }), { status: 200 });
}
