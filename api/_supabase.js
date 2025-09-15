// api/_supabase.js
import { createClient } from '@supabase/supabase-js';

export function supabase(service = false) {
  // Fallback to multiple environment variable patterns
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = service
    ? (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY)
    : (process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY);
  
  // Require environment variables for Supabase connection
  if (!url || !key) {
    console.error('Missing Supabase environment variables');
    console.error('SUPABASE_URL:', url ? 'SET' : 'NOT_SET');
    console.error('SUPABASE_ANON_KEY:', key ? 'SET' : 'NOT_SET');
    console.error('Available env vars:', Object.keys(process.env).filter(k => k.includes('SUPABASE')));
    
    throw new Error(`Missing Supabase environment variables. Required: SUPABASE_URL${url ? ' ✓' : ' ✗'}, SUPABASE_ANON_KEY${key ? ' ✓' : ' ✗'}`);
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

