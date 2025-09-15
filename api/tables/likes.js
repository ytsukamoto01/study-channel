// /api/tables/likes.js
import { supabase, parseListParams } from '../_supabase.js';

export default async function handler(req, res) {
  try {
    const db = supabase(); // 通常のanon key使用
    
    if (req.method === 'GET') {
      try {
        const { limit, sort, order } = parseListParams(req);
        
        console.log('Fetching likes from Supabase');
        
        const { data, error } = await db
          .from('likes')
          .select('*')
          .order(sort || 'created_at', { ascending: order === 'asc' })
          .limit(limit);
        
        if (error) {
          console.error('Supabase likes error:', error);
          throw error;
        }
        
        console.log('Successfully fetched likes from Supabase:', data?.length || 0);
        return res.status(200).json({ data: data || [] });
        
      } catch (supabaseError) {
        console.error('Supabase likes error:', supabaseError);
        
        return res.status(200).json({ 
          data: [],
          error: {
            message: 'Failed to fetch likes from database',
            supabase_error: supabaseError.message,
            need_config: !process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY
          }
        });
      }
    }

    if (req.method === 'POST') {
      try {
        const body = typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
        
        console.log('Creating new like:', body);
        
        if (!body.target_type || !body.target_id || !body.user_fingerprint) {
          return res.status(400).json({ error: 'missing fields: target_type, target_id, user_fingerprint required' });
        }
        
        // まず既存のいいねをチェック
        const { data: existingLike } = await db
          .from('likes')
          .select('id')
          .eq('target_type', body.target_type)
          .eq('target_id', body.target_id)
          .eq('user_fingerprint', body.user_fingerprint)
          .maybeSingle();
        
        if (existingLike) {
          return res.status(409).json({ 
            error: 'Already liked',
            message: 'このアイテムには既にいいねしています'
          });
        }
        
        // 新しいいいねを作成
        const likeData = {
          target_type: body.target_type,
          target_id: body.target_id,
          user_fingerprint: body.user_fingerprint
        };
        
        const { data, error } = await db
          .from('likes')
          .insert(likeData)
          .select()
          .single();
        
        if (error) {
          console.error('Supabase like insert error:', error);
          throw error;
        }
        
        console.log('Successfully created like in Supabase:', data.id);
        return res.status(201).json({ data: data });
        
      } catch (supabaseError) {
        console.error('Supabase like creation error:', supabaseError);
        
        return res.status(500).json({ 
          error: 'Failed to create like',
          message: supabaseError.message,
          need_config: !process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY
        });
      }
    }

    return res.status(405).json({ error: 'method not allowed' });
    
  } catch (error) {
    console.error('Likes API Error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
}

