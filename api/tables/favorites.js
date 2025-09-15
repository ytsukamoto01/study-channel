// Favorites API with Supabase integration
import { supabase, parseListParams } from '../_supabase.js';

export default async function handler(req, res) {
  try {
    const db = supabase();
    
    if (req.method === 'GET') {
      try {
        const { limit, sort, order } = parseListParams(req);
        
        console.log('Fetching favorites from Supabase');
        
        const { data, error } = await db
          .from('favorites')
          .select('*')
          .order(sort || 'created_at', { ascending: order === 'asc' })
          .limit(limit);
        
        if (error) {
          console.error('Supabase favorites error:', error);
          throw error;
        }
        
        console.log('Successfully fetched favorites from Supabase:', data?.length || 0);
        return res.status(200).json({ data: data || [] });
        
      } catch (supabaseError) {
        console.error('Supabase favorites error:', supabaseError);
        
        // Return empty array instead of mock data
        return res.status(200).json({ 
          data: [],
          error: {
            message: 'Failed to fetch favorites from database',
            supabase_error: supabaseError.message,
            need_config: !process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY
          }
        });
      }
    }

    if (req.method === 'POST') {
      try {
        const body = typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
        
        console.log('Creating new favorite:', body);
        
        const favoriteData = {
          thread_id: body.thread_id,
          user_fingerprint: body.user_fingerprint || 'anonymous'
        };
        
        const { data, error } = await db
          .from('favorites')
          .insert(favoriteData)
          .select()
          .single();
        
        if (error) {
          console.error('Supabase favorite insert error:', error);
          throw error;
        }
        
        console.log('Successfully created favorite in Supabase:', data.id);
        return res.status(200).json({ data: data });
        
      } catch (supabaseError) {
        console.error('Supabase favorite creation error:', supabaseError);
        
        return res.status(500).json({ 
          error: 'Failed to create favorite',
          message: supabaseError.message,
          need_config: !process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY
        });
      }
    }

    if (req.method === 'DELETE') {
      try {
        // DELETEリクエストの場合、URLからIDを取得
        const url = new URL(req.url, `https://${req.headers.host}`);
        const pathSegments = url.pathname.split('/');
        const favoriteId = pathSegments[pathSegments.length - 1];
        
        if (!favoriteId || favoriteId === 'favorites') {
          return res.status(400).json({ error: 'Favorite ID required for deletion' });
        }
        
        console.log('Deleting favorite:', favoriteId);
        
        const { error } = await db
          .from('favorites')
          .delete()
          .eq('id', favoriteId);
        
        if (error) {
          console.error('Supabase favorite delete error:', error);
          throw error;
        }
        
        console.log('Successfully deleted favorite from Supabase:', favoriteId);
        return res.status(204).end();
        
      } catch (supabaseError) {
        console.error('Supabase favorite deletion error:', supabaseError);
        
        return res.status(500).json({ 
          error: 'Failed to delete favorite',
          message: supabaseError.message,
          need_config: !process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY
        });
      }
    }

    return res.status(405).json({ error: 'method not allowed' });

  } catch (error) {
    console.error('Favorites API Error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
}