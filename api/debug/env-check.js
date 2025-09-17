// /api/debug/env-check.js - 環境変数の設定状況を確認
export default async function handler(req, res) {
  // セキュリティのため、値は表示せず存在確認のみ
  const envCheck = {
    SUPABASE_URL: !!process.env.SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    VITE_SUPABASE_URL: !!process.env.VITE_SUPABASE_URL,
    SUPABASE_ANON_KEY: !!process.env.SUPABASE_ANON_KEY,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    VITE_SUPABASE_ANON_KEY: !!process.env.VITE_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_SERVICE_KEY: !!process.env.SUPABASE_SERVICE_KEY,
  };
  
  // どの環境変数が利用可能かチェック
  const availableSupabaseVars = Object.keys(process.env)
    .filter(key => key.includes('SUPABASE'))
    .sort();
  
  console.log('Environment check:', envCheck);
  console.log('Available SUPABASE vars:', availableSupabaseVars);
  
  return res.status(200).json({
    check: envCheck,
    availableVars: availableSupabaseVars,
    // 最低限必要な変数がセットされているか
    hasUrl: envCheck.SUPABASE_URL || envCheck.NEXT_PUBLIC_SUPABASE_URL || envCheck.VITE_SUPABASE_URL,
    hasServiceKey: envCheck.SUPABASE_SERVICE_ROLE_KEY || envCheck.SUPABASE_SERVICE_KEY,
    hasAnonKey: envCheck.SUPABASE_ANON_KEY || envCheck.NEXT_PUBLIC_SUPABASE_ANON_KEY || envCheck.VITE_SUPABASE_ANON_KEY
  });
}