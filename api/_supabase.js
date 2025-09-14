// api/_supabase.js
import { createClient } from '@supabase/supabase-js';

export function supabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY; // 必要に応じて SERVICE_ROLE に
  if (!url || !key) throw new Error('Supabase env is missing');
  return createClient(url, key, { auth: { persistSession: false } });
}

// 汎用: クエリパラメータから limit/sort を読む
export function parseListParams(req) {
  const url = new URL(req.url);
  const limit = Number(url.searchParams.get('limit') || '100');
  const sort = url.searchParams.get('sort') || 'created_at';
  const order = url.searchParams.get('order') || 'desc';
  return { limit, sort, order };
}
