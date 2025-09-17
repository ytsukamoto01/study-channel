// Threads API with Supabase integration
import { supabase, parseListParams } from '../_supabase.js';

// Calculate real-time like count and comment count for a thread
async function calculateThreadCounts(db, thread) {
  try {
    console.log('calculateThreadCounts called for thread:', thread.id, thread.title);
    
    // Calculate like count
    const { count: likeCount, error: likesError } = await db
      .from('likes')
      .select('*', { count: 'exact', head: true })
      .eq('target_type', 'thread')
      .eq('target_id', thread.id);
    
    if (likesError) {
      console.error('Error fetching like count for thread', thread.id, ':', likesError);
    }
    
    console.log('Like count for thread', thread.id, ':', likeCount);
    
    // Calculate comment count (both parent comments and replies)
    const { count: commentCount, error: commentsError } = await db
      .from('comments')
      .select('*', { count: 'exact', head: true })
      .eq('thread_id', thread.id);
    
    if (commentsError) {
      console.error('Error fetching comment count for thread', thread.id, ':', commentsError);
    }
    
    console.log('Comment count for thread', thread.id, ':', commentCount);
    
    const updatedThread = {
      ...thread,
      like_count: likeCount || 0,
      reply_count: commentCount || 0
    };
    
    console.log('Updated thread with counts:', {
      id: updatedThread.id,
      title: updatedThread.title,
      original_like_count: thread.like_count,
      new_like_count: updatedThread.like_count,
      reply_count: updatedThread.reply_count
    });
    
    return updatedThread;
  } catch (error) {
    console.error('Error calculating thread counts for thread', thread.id, ':', error);
    console.error('Error stack:', error.stack);
    
    // Try alternative method: direct count query as fallback
    try {
      console.log('Attempting fallback like count method for thread', thread.id);
      
      const { data: likes, error: fallbackError } = await db
        .from('likes')
        .select('id')
        .eq('target_type', 'thread')
        .eq('target_id', thread.id);
      
      if (!fallbackError && Array.isArray(likes)) {
        const fallbackLikeCount = likes.length;
        console.log('Fallback like count successful:', fallbackLikeCount);
        
        return {
          ...thread,
          like_count: fallbackLikeCount,
          reply_count: thread.reply_count || 0
        };
      }
      
      console.error('Fallback method also failed:', fallbackError);
    } catch (fallbackError) {
      console.error('Fallback method exception:', fallbackError);
    }
    
    // Return thread with original counts if all methods fail
    console.log('All methods failed, returning original thread:', {
      id: thread.id,
      title: thread.title,
      original_like_count: thread.like_count
    });
    return thread;
  }
}

export default async function handler(req, res) {
  try {
    const db = supabase();
    
    if (req.method === 'GET') {
      // Parse URL to get query parameters
      const url = new URL(req.url, `https://${req.headers.host || 'localhost'}`);
      const userFingerprint = url.searchParams.get('user_fingerprint');
      const threadId = url.pathname.split('/').pop(); // Extract thread ID from URL path
      const { limit, sort, order } = parseListParams(req);
      
      console.log('GET /api/tables/threads - userFingerprint:', userFingerprint);
      console.log('Query params - limit:', limit, 'sort:', sort, 'order:', order, 'threadId:', threadId);
      
      try {
        // Single thread request (e.g., /api/tables/threads/[id])
        if (threadId && threadId !== 'threads') {
          console.log('=== THREADS API: Fetching single thread ===');
          console.log('Thread ID:', threadId);
          console.log('Request URL:', req.url);
          console.log('Request method:', req.method);
          
          const { data: threadData, error } = await db
            .from('threads')
            .select('*')
            .eq('id', threadId)
            .single();
          
          if (error) {
            console.error('Supabase single thread query error:', error);
            throw error;
          }
          
          if (!threadData) {
            return res.status(404).json({ error: 'Thread not found' });
          }
          
          // Calculate real-time counts
          console.log('About to calculate thread counts for thread:', threadData.id);
          console.log('Thread data before calculation:', {
            id: threadData.id,
            title: threadData.title,
            original_like_count: threadData.like_count
          });
          
          const updatedThread = await calculateThreadCounts(db, threadData);
          
          console.log('Thread counts calculation completed for:', threadData.id);
          console.log('Updated thread data:', {
            id: updatedThread.id,
            title: updatedThread.title,
            original_like_count: threadData.like_count,
            calculated_like_count: updatedThread.like_count,
            reply_count: updatedThread.reply_count
          });
          
          console.log('Successfully fetched single thread:', updatedThread.title);
          return res.status(200).json({ data: updatedThread });
        }
        
        // List threads request
        let query = db.from('threads').select('*');
        
        // If user_fingerprint is specified, filter to that user's threads only
        if (userFingerprint) {
          query = query.eq('user_fingerprint', userFingerprint);
        }
        
        // Apply sorting
        query = query.order(sort, { ascending: order === 'asc' });
        
        // Apply limit
        if (limit && limit > 0) {
          query = query.limit(limit);
        }
        
        const { data, error } = await query;
        
        if (error) {
          console.error('Supabase query error:', error);
          throw error;
        }
        
        // Calculate real-time counts for all threads
        const threadsWithCounts = await Promise.all(
          (data || []).map(thread => calculateThreadCounts(db, thread))
        );
        
        console.log('Successfully fetched threads from Supabase:', threadsWithCounts?.length || 0, 'threads');
        return res.status(200).json({ data: threadsWithCounts || [] });
        
      } catch (supabaseError) {
        console.error('Supabase error, falling back to mock data:', supabaseError);
        
        // Fallback to mock data if Supabase fails
        const requestedUserFP = userFingerprint || 'default-user-fp';
      
      // Generate mock threads for the requested user
      const userMockThreads = [
        {
          id: '40c41e65-d184-4e16-b75b-e432777ce5ac',
          title: 'あなたのテストスレッド 1',
          content: 'これはあなたが作成したテストスレッドです。編集・削除が可能です。',
          category: 'テスト',
          subcategory: 'API修復',
          author_name: 'あなた',
          user_fingerprint: requestedUserFP, // リクエストされたユーザーFP
          created_at: new Date(Date.now() - 60000).toISOString(),
          like_count: 5,
          reply_count: 3,
          hashtags: ['API修復', 'テスト', '自分の投稿'],
          images: []
        },
        {
          id: '50c41e65-d184-4e16-b75b-e432777ce5ac',
          title: 'あなたのテストスレッド 2',
          content: 'もう一つのあなたのスレッドです。編集・削除機能をテストできます。',
          category: 'テスト',
          subcategory: '機能テスト',
          author_name: 'あなた',
          user_fingerprint: requestedUserFP, // リクエストされたユーザーFP
          created_at: new Date(Date.now() - 120000).toISOString(),
          like_count: 2,
          reply_count: 1,
          hashtags: ['機能テスト', '自分の投稿'],
          images: []
        },
      ];

      // Other users' threads (for general display)
      const otherMockThreads = [
        {
          id: '60c41e65-d184-4e16-b75b-e432777ce5ac',
          title: '他のユーザーのスレッド',
          content: 'これは他のユーザーが作成したスレッドです。',
          category: '一般',
          subcategory: null,
          author_name: '他のユーザー',
          user_fingerprint: 'other-user-fp',
          created_at: new Date(Date.now() - 180000).toISOString(),
          like_count: 8,
          reply_count: 5,
          hashtags: ['一般'],
          images: []
        }
      ];

      // If user_fingerprint is specified, return only user's threads
      // Otherwise, return all threads (user's + others)
      const threadsToReturn = userFingerprint ? 
        userMockThreads : 
        [...userMockThreads, ...otherMockThreads];

        console.log('Fallback: Threads to return count:', threadsToReturn.length);
        console.log('Fallback: User threads created for FP:', requestedUserFP);

        return res.status(200).json({ 
          data: threadsToReturn,
          fallback: true,
          supabase_error: supabaseError.message 
        });
      }
    }

    if (req.method === 'POST') {
      try {
        const body = typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
        
        console.log('Creating new thread:', body);
        
        const threadData = {
          title: body.title || 'New Thread',
          content: body.content || 'New thread content',
          category: body.category || 'General',
          subcategory: body.subcategory || null,
          author_name: body.author_name || '匿名',
          user_fingerprint: body.user_fingerprint || 'anonymous',
          like_count: 0,
          reply_count: 0,
          hashtags: body.hashtags || [],
          images: body.images || []
        };
        
        const { data, error } = await db
          .from('threads')
          .insert(threadData)
          .select()
          .single();
        
        if (error) {
          console.error('Supabase thread insert error:', error);
          throw error;
        }
        
        console.log('Successfully created thread in Supabase:', data.id);
        return res.status(200).json({ data: data });
        
      } catch (supabaseError) {
        console.error('Supabase thread creation error, falling back:', supabaseError);
        
        // Fallback to mock response
        const body = typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
        const newThread = {
          id: `new-${Date.now()}`,
          title: body.title || 'New Test Thread',
          content: body.content || 'New test content',
          category: body.category || 'Test',
          subcategory: body.subcategory || null,
          author_name: body.author_name || '匿名',
          user_fingerprint: body.user_fingerprint || 'anonymous',
          created_at: new Date().toISOString(),
          like_count: 0,
          reply_count: 0,
          hashtags: body.hashtags || [],
          images: body.images || []
        };

        return res.status(200).json({ 
          data: newThread,
          debug: {
            supabase_error: supabaseError.message,
            using_fallback: true
          }
        });
      }
    }

    return res.status(405).json({ error: 'method not allowed' });

  } catch (error) {
    console.error('Threads API Error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
}