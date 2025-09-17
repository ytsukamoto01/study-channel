// /api/favorites/toggle.js - Vercel API Routes対応
import { createClient } from '@supabase/supabase-js';

// Supabase Admin Client (Service Role Key使用)
function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !serviceKey) {
    throw new Error('Missing Supabase environment variables: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  
  return createClient(supabaseUrl, serviceKey, { 
    auth: { persistSession: false, autoRefreshToken: false } 
  });
}

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { threadId, userFingerprint } = req.body || {};
    
    if (!threadId || !userFingerprint) {
      return res.status(400).json({ 
        error: 'threadId and userFingerprint are required' 
      });
    }

    console.log('Toggle favorite:', { threadId, userFingerprint });

    const supabaseAdmin = getSupabaseAdmin();
    
    // Call Supabase RPC function
    const { data, error } = await supabaseAdmin.rpc('toggle_favorite', {
      p_thread_id: threadId,
      p_user_fingerprint: userFingerprint,
    });
    
    if (error) {
      console.error('Supabase RPC error:', error);
      return res.status(500).json({ 
        error: `Supabase RPC failed: ${error.message}`,
        details: error
      });
    }

    console.log('Toggle result:', data);
    
    // data should be 'favorited' | 'unfavorited'
    return res.status(200).json({ 
      ok: true, 
      action: data 
    });
    
  } catch (error) {
    console.error('Toggle favorite error:', error);
    
    return res.status(500).json({ 
      error: error?.message || 'Internal Server Error',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}