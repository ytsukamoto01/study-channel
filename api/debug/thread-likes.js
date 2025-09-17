// /api/debug/thread-likes.js - スレッドのいいね数デバッグ用API
import { supabase } from '../_supabase.js';

export default async function handler(req, res) {
  try {
    const { threadId } = req.query;
    
    if (!threadId) {
      return res.status(400).json({ error: 'threadId parameter is required' });
    }

    const db = supabase();
    
    console.log('Debugging likes for thread:', threadId);
    
    // 1. スレッド基本情報を取得
    const { data: thread, error: threadError } = await db
      .from('threads')
      .select('*')
      .eq('id', threadId)
      .single();
      
    if (threadError) {
      console.error('Thread fetch error:', threadError);
      return res.status(500).json({ error: 'Thread fetch failed', details: threadError });
    }
    
    // 2. いいね一覧を取得
    const { data: likes, error: likesError } = await db
      .from('likes')
      .select('*')
      .eq('target_type', 'thread')
      .eq('target_id', threadId);
      
    if (likesError) {
      console.error('Likes fetch error:', likesError);
      return res.status(500).json({ error: 'Likes fetch failed', details: likesError });
    }
    
    // 3. いいね数をカウント
    const { count: likeCount, error: countError } = await db
      .from('likes')
      .select('*', { count: 'exact', head: true })
      .eq('target_type', 'thread')
      .eq('target_id', threadId);
      
    if (countError) {
      console.error('Like count error:', countError);
      return res.status(500).json({ error: 'Like count failed', details: countError });
    }
    
    // 4. threads APIと同じ計算方法でいいね数を算出
    const calculatedThread = {
      ...thread,
      like_count: likeCount || 0,
      original_like_count: thread.like_count
    };
    
    // デバッグ情報をまとめて返す
    const debugInfo = {
      threadId: threadId,
      threadExists: !!thread,
      threadTitle: thread?.title || 'N/A',
      originalLikeCount: thread?.like_count || 0,
      calculatedLikeCount: likeCount || 0,
      likesData: likes || [],
      likesDataCount: likes?.length || 0,
      updatedThread: calculatedThread,
      timestamp: new Date().toISOString()
    };
    
    console.log('Thread likes debug info:', debugInfo);
    
    return res.status(200).json(debugInfo);
    
  } catch (error) {
    console.error('Thread likes debug error:', error);
    return res.status(500).json({ 
      error: error.message || 'Internal server error',
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}