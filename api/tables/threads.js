// Threads API with Supabase integration
import { supabase, parseListParams } from '../_supabase.js';

export default async function handler(req, res) {
  try {
    const db = supabase();
    
    if (req.method === 'GET') {
      // Parse URL to get query parameters
      const url = new URL(req.url, `https://${req.headers.host || 'localhost'}`);
      const userFingerprint = url.searchParams.get('user_fingerprint');
      const { limit, sort, order } = parseListParams(req);
      
      console.log('GET /api/tables/threads - userFingerprint:', userFingerprint);
      console.log('Query params - limit:', limit, 'sort:', sort, 'order:', order);
      
      try {
        // Build query
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
        
        console.log('Successfully fetched threads from Supabase:', data?.length || 0, 'threads');
        return res.status(200).json({ data: data || [] });
        
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
      const body = typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
      
      // Create new mock thread
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

      return res.status(200).json({ data: newThread });
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