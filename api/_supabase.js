// api/_supabase.js
import { createClient } from '@supabase/supabase-js';

export function supabase(service = false) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = service
    ? process.env.SUPABASE_SERVICE_ROLE_KEY
    : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  if (!url || !key) {
    console.error('Missing Supabase environment variables:', { 
      url: !!url, 
      key: !!key, 
      service,
      available_env: Object.keys(process.env).filter(k => k.includes('SUPABASE'))
    });
    throw new Error('Supabase env is missing');
  }
  
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

