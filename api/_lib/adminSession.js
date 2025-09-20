// /api/_lib/adminSession.js
import crypto from "crypto";
import { cookies } from "next/headers"; // app router
// pages/api の場合は cookie パーサを使うか、レスポンスに setHeader を使ってください

const COOKIE_NAME = "sc_admin_session";
const MAX_AGE_SEC = 60 * 60 * 12; // 12h

function sign(value, secret) {
  const h = crypto.createHmac("sha256", secret).update(value).digest("hex");
  return `${value}.${h}`;
}
function verify(signed, secret) {
  const [value, sig] = signed.split(".");
  const check = crypto.createHmac("sha256", secret).update(value).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(check)) ? value : null;
}

export function setAdminSessionCookie({ res, admin = true }) {
  const secret = process.env.SESSION_SECRET;
  const payload = JSON.stringify({ admin, iat: Date.now() });
  const signed = sign(payload, secret);
  // app router の場合:
  cookies().set({
    name: COOKIE_NAME,
    value: signed,
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SEC,
  });
}

export function clearAdminSessionCookie() {
  cookies().set({
    name: COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export function requireAdmin() {
  const c = cookies().get(COOKIE_NAME);
  if (!c?.value) return false;
  const secret = process.env.SESSION_SECRET;
  try {
    const raw = verify(c.value, secret);
    if (!raw) return false;
    const obj = JSON.parse(raw);
    return !!obj.admin;
  } catch {
    return false;
  }
}
