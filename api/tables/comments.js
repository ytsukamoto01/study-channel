// Comments API with Supabase integration
import { supabase, parseListParams } from '../_supabase.js';

// 🚀 OPTIMIZATION: Batch calculate like counts for all comments
async function calculateAllCommentCounts(db, comments) {
  try {
    if (!comments || comments.length === 0) {
      return comments;
    }
    
    // Extract all comment IDs for batch query
    const commentIds = comments.map(c => c.id);
    
    console.log('Batch calculating like counts for', commentIds.length, 'comments');
    
    // Single query to get all like counts for comments
    const { data: likesData, error } = await db
      .from('likes')
      .select('target_id')
      .eq('target_type', 'comment')
      .in('target_id', commentIds);
    
    if (error) {
      console.error('Error fetching comment likes:', error);
      // Return original comments if query fails
      return comments;
    }
    
    // Count likes by comment ID
    const likeCounts = {};
    (likesData || []).forEach(like => {
      likeCounts[like.target_id] = (likeCounts[like.target_id] || 0) + 1;
    });
    
    // Apply counts to comments
    const commentsWithCounts = comments.map(comment => ({
      ...comment,
      like_count: likeCounts[comment.id] || 0
    }));
    
    console.log('Successfully calculated likes for', commentIds.length, 'comments');
    return commentsWithCounts;
    
  } catch (error) {
    console.error('Error in batch comment count calculation:', error);
    // Return original comments if calculation fails
    return comments;
  }
}

// Legacy function for backward compatibility (single comment)
async function calculateCommentCounts(db, comment) {
  try {
    // Use batch function for single comment
    const results = await calculateAllCommentCounts(db, [comment]);
    return results[0] || comment;
  } catch (error) {
    console.error('Error calculating comment counts:', error);
    return comment;
  }
}

export default async function handler(req, res) {
  try {
    const db = supabase();
    
    if (req.method === 'GET') {
      try {
        const url = new URL(req.url, `https://${req.headers.host}`);
        const threadId = url.searchParams.get('thread_id');
        
        console.log('Fetching comments for thread:', threadId);
        
        let query = db
       .from('comments')
       // threads テーブルの admin_mark をネスト取得
       .select('*, threads(admin_mark)')
       .order('created_at', { ascending: true });
        
        if (threadId) {
          query = query.eq('thread_id', threadId);
        }
        
        const { data, error } = await query;
        
        if (error) {
          console.error('Supabase comments error:', error);
          throw error;
        }
        
       // threads.admin_mark をフラット化して c.admin_mark に格納
       const withAdmin = (data || []).map(c => ({
         ...c,
         admin_mark: !!(c.threads?.admin_mark)
       }));

       // 🚀 OPTIMIZATION: Batch calculate like counts instead of individual queries
       const commentsWithCounts = await calculateAllCommentCounts(db, withAdmin);
        
        console.log('Successfully fetched comments from Supabase:', commentsWithCounts?.length || 0);
        return res.status(200).json({ data: commentsWithCounts || [] });
        
      } catch (supabaseError) {
        console.error('Supabase comments error, falling back to mock data:', supabaseError);
        
        // フォールバック用のモックコメントデータ
        const threadId = url.searchParams.get('thread_id') || 'default-thread';
        const mockComments = [
          {
            id: `comment-${threadId}-1`,
            thread_id: threadId,
            content: 'これはテスト用のコメントです。Supabase接続に問題があるため、モックデータを表示しています。',
            images: [],
            author_name: 'テストユーザー1',
            user_fingerprint: 'test-user-1',
            created_at: new Date(Date.now() - 3600000).toISOString(), // 1時間前
            like_count: 2,
            comment_number: 1,
            parent_comment_id: null
          },
          {
            id: `comment-${threadId}-2`,
            thread_id: threadId,
            content: 'これも別のテストコメントです。データベース接続が復旧すれば実際のデータが表示されます。',
            images: [],
            author_name: 'テストユーザー2',
            user_fingerprint: 'test-user-2',
            created_at: new Date(Date.now() - 1800000).toISOString(), // 30分前
            like_count: 1,
            comment_number: 2,
            parent_comment_id: null
          },
          {
            id: `comment-${threadId}-3`,
            thread_id: threadId,
            content: '>> 1\nこれは返信のテストです。',
            images: [],
            author_name: 'テストユーザー3',
            user_fingerprint: 'test-user-3',
            created_at: new Date(Date.now() - 900000).toISOString(), // 15分前
            like_count: 0,
            comment_number: 3,
            parent_comment_id: `comment-${threadId}-1`
          }
        ];
        
        return res.status(200).json({ 
          data: mockComments,
          fallback: true,
          error: {
            message: 'Failed to fetch comments from database, using mock data',
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
        
        // Calculate next comment number for this thread
        const { count: existingCommentsCount } = await db
          .from('comments')
          .select('*', { count: 'exact', head: true })
          .eq('thread_id', body.thread_id);
        
        const nextCommentNumber = (existingCommentsCount || 0) + 1;
        
        const commentData = {
          thread_id: body.thread_id,
          content: body.content || '',
          images: Array.isArray(body.images) ? body.images : [],
          author_name: body.author_name || '匿名',
          user_fingerprint: body.user_fingerprint || 'anonymous',
          like_count: 0,
          comment_number: nextCommentNumber,
          parent_comment_id: body.parent_comment_id || null
        };
        
        // バリデーション: コンテンツまたは画像のどちらかが必要
        if (!commentData.content.trim() && (!commentData.images || commentData.images.length === 0)) {
          return res.status(400).json({ 
            error: 'Content or images required',
            message: 'コメントにはテキストまたは画像が必要です'
          });
        }
        
        const { data, error } = await db
          .from('comments')
          .insert(commentData)
          .select()
          .single();
        
        if (error) {
          console.error('Supabase comment insert error:', error);
          throw error;
        }
        
       // 対応するスレッドの admin_mark を取得
       const { data: threadRow } = await db
         .from('threads')
         .select('admin_mark')
         .eq('id', data.thread_id)
         .single();

       const withAdmin = {
         ...data,
         admin_mark: !!(threadRow?.admin_mark)
       };

       // like数の再計算（必要なら）
       const commentWithCounts = await calculateCommentCounts(db, withAdmin);
        
        console.log('Successfully created comment in Supabase:', commentWithCounts.id);
        return res.status(200).json({ data: commentWithCounts });
        
      } catch (supabaseError) {
        console.error('Supabase comment creation error, falling back to mock response:', supabaseError);
        
        // フォールバック用のモック投稿レスポンス
        const body = typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
        
        // Generate next comment number (simulate database calculation)
        const nextCommentNumber = Math.floor(Math.random() * 100) + 1; // Random for mock
        
        const mockComment = {
          id: `mock-comment-${Date.now()}`,
          thread_id: body.thread_id || 'default-thread',
          content: body.content || 'New comment',
          images: Array.isArray(body.images) ? body.images : [],
          author_name: body.author_name || '匿名',
          user_fingerprint: body.user_fingerprint || 'anonymous',
          created_at: new Date().toISOString(),
          like_count: 0,
          comment_number: nextCommentNumber,
          parent_comment_id: body.parent_comment_id || null
        };
        
        return res.status(200).json({ 
          data: mockComment,
          fallback: true,
          error: {
            message: 'Failed to create comment in database, using mock response',
            supabase_error: supabaseError.message,
            need_config: !process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY
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
