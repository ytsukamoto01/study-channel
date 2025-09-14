// api/_supabase.js
import { createClient } from '@supabase/supabase-js';

export function supabase() {
  console.log('SUPABASE_URL:', process.env.SUPABASE_URL);
  console.log('SUPABASE_ANON_KEY:', process.env.SUPABASE_ANON_KEY ? '***' : '(undefined)');

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
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
