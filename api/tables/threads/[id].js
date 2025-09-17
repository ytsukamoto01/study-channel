// Single thread API - /api/tables/threads/[id]
import { supabase } from '../../_supabase.js';

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
    console.log('=== SINGLE THREAD API CALLED ===');
    console.log('Request method:', req.method);
    console.log('Request URL:', req.url);
    console.log('Query params:', req.query);
    
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { id: threadId } = req.query;
    
    console.log('=== THREADS API: Fetching single thread ===');
    console.log('Thread ID from query:', threadId);
    
    if (!threadId) {
      return res.status(400).json({ error: 'Thread ID is required' });
    }

    const db = supabase();
    
    console.log('About to fetch thread from database:', threadId);
    
    const { data: threadData, error } = await db
      .from('threads')
      .select('*')
      .eq('id', threadId)
      .single();
    
    if (error) {
      console.error('Supabase single thread query error:', error);
      return res.status(500).json({ error: 'Database query failed', details: error });
    }
    
    if (!threadData) {
      console.log('Thread not found:', threadId);
      return res.status(404).json({ error: 'Thread not found' });
    }

    console.log('Thread data fetched successfully:', threadData.title);
    console.log('About to calculate thread counts for thread:', threadData.id);
    console.log('Thread data before calculation:', {
      id: threadData.id,
      title: threadData.title,
      original_like_count: threadData.like_count
    });
    
    const updatedThread = await calculateThreadCounts(db, threadData);
    
    console.log('Thread counts calculation completed for:', threadData.id);
    console.log('Final thread data being returned:', {
      id: updatedThread.id,
      title: updatedThread.title,
      original_like_count: threadData.like_count,
      calculated_like_count: updatedThread.like_count,
      reply_count: updatedThread.reply_count
    });
    
    console.log('Successfully fetched single thread:', updatedThread.title);
    return res.status(200).json({ data: updatedThread });
    
  } catch (error) {
    console.error('Single thread API error:', error);
    return res.status(500).json({ 
      error: error.message || 'Internal server error',
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}