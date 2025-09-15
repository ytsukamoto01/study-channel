// api/_supabase.js
import { createClient } from '@supabase/supabase-js';

export function supabase(service = false) {
  const url = process.env.SUPABASE_URL;
  const key = service
    ? process.env.SUPABASE_SERVICE_ROLE_KEY
    : process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase env is missing');
  return createClient(url, key, { auth: { persistSession: false } });
}

export function parseListParams(req) {
  const url = new URL(req.url, `https://${req.headers.host}`);
  return {
    limit: Number(url.searchParams.get('limit') || '100'),
    sort: url.searchParams.get('sort') || 'created_at',
    order: url.searchParams.get('order') || 'desc'
  };
}

