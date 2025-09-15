// Comments API with Supabase integration
import { supabase, parseListParams } from '../_supabase.js';

export default async function handler(req, res) {
  try {
    const db = supabase();
    
    if (req.method === 'GET') {
      try {
        const url = new URL(req.url, `https://${req.headers.host}`);
        const threadId = url.searchParams.get('thread_id');
        
        console.log('Fetching comments for thread:', threadId);
        
        let query = db.from('comments').select('*').order('created_at', { ascending: true });
        
        if (threadId) {
          query = query.eq('thread_id', threadId);
        }
        
        const { data, error } = await query;
        
        if (error) {
          console.error('Supabase comments error:', error);
          throw error;
        }
        
        console.log('Successfully fetched comments from Supabase:', data?.length || 0);
        return res.status(200).json({ data: data || [] });
        
      } catch (supabaseError) {
        console.error('Supabase comments error:', supabaseError);
        
        // Return empty array instead of mock data
        return res.status(200).json({ 
          data: [],
          error: {
            message: 'Failed to fetch comments from database',
            supabase_error: supabaseError.message,
            need_config: !process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY
          }
        });
      }
    }

    if (req.method === 'POST') {
      try {
        const body = typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
        
        console.log('Creating new comment:', body);
        
        const commentData = {
          thread_id: body.thread_id,
          content: body.content || 'New comment',
          author_name: body.author_name || '匿名',
          user_fingerprint: body.user_fingerprint || 'anonymous',
          like_count: 0,
          comment_number: body.comment_number || 1,
          parent_comment_id: body.parent_comment_id || null
        };
        
        const { data, error } = await db
          .from('comments')
          .insert(commentData)
          .select()
          .single();
        
        if (error) {
          console.error('Supabase comment insert error:', error);
          throw error;
        }
        
        console.log('Successfully created comment in Supabase:', data.id);
        return res.status(200).json({ data: data });
        
      } catch (supabaseError) {
        console.error('Supabase comment creation error:', supabaseError);
        
        return res.status(500).json({ 
          error: 'Failed to create comment',
          message: supabaseError.message,
          need_config: !process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY
        });
      }
    }

    return res.status(405).json({ error: 'method not allowed' });

  } catch (error) {
    console.error('Comments API Error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
}