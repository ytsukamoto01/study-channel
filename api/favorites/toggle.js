// /api/favorites/toggle.js - Vercel API Routes対応
import { supabase } from '../_supabase.js';

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

    // Use service role for admin operations (bypass RLS)
    const serviceDb = supabase(true);
    
    // Call Supabase RPC function
    const { data, error } = await serviceDb.rpc('toggle_favorite', {
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