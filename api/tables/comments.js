// Comments API with Supabase integration
import { supabase, parseListParams } from '../_supabase.js';

export default async function handler(req, res) {
  try {
    const db = supabase();
    
    if (req.method === 'GET') {
      try {
        const url = new URL(req.url, 'http://localhost');
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
        console.error('Supabase comments error, falling back to mock data:', supabaseError);
        
        // Fallback to mock comments
        const mockComments = [
          {
            id: 'comment-1',
            thread_id: '40c41e65-d184-4e16-b75b-e432777ce5ac',
            content: 'テストコメント1です。',
            author_name: 'テストユーザー',
            user_fingerprint: 'test-user-fp',
            created_at: new Date().toISOString(),
            like_count: 1,
            comment_number: 1,
            parent_comment_id: null
          }
        ];

        return res.status(200).json({ 
          data: mockComments,
          debug: {
            supabase_error: supabaseError.message,
            using_fallback: true
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
        console.error('Supabase comment creation error, falling back:', supabaseError);
        
        // Fallback to mock response
        const body = typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
        const newComment = {
          id: `comment-${Date.now()}`,
          thread_id: body.thread_id,
          content: body.content || 'New test comment',
          author_name: body.author_name || '匿名',
          user_fingerprint: body.user_fingerprint || 'anonymous',
          created_at: new Date().toISOString(),
          like_count: 0,
          comment_number: body.comment_number || 1,
          parent_comment_id: body.parent_comment_id || null
        };

        return res.status(200).json({ 
          data: newComment,
          debug: {
            supabase_error: supabaseError.message,
            using_fallback: true
          }
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