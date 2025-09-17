// /lib/supabaseAdmin.ts
import { createClient } from '@supabase/supabase-js';

export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,          // 例: https://xxx.supabase.co
  process.env.SUPABASE_SERVICE_ROLE_KEY!,         // ← サーバだけに置く
  { auth: { persistSession: false, autoRefreshToken: false } }
);
