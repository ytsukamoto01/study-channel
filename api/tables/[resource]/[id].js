// Resource API with Supabase integration
import { supabase } from '../../_supabase.js';

export default async function handler(req, res) {
  try {
    console.log('=== API Request ===');
    console.log('Method:', req.method);
    console.log('URL:', req.url);
    console.log('Query:', req.query);
    
    const { resource, id } = req.query;
    const db = supabase();
    
    // Basic validation
    if (!resource || !id) {
      console.log('Missing params - resource:', resource, 'id:', id);
      return res.status(400).json({ 
        error: 'missing params',
        received: { resource, id },
        debug: 'API called but missing required parameters'
      });
    }

    console.log(`Processing ${req.method} request for ${resource}/${id}`);

    // Extract user_fingerprint from request
    let currentUserFingerprint = 'default-user-fp'; // デフォルト値
    
    if (req.method === 'POST' || req.method === 'PATCH') {
      const body = typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
      currentUserFingerprint = body.user_fingerprint || currentUserFingerprint;
    } else if (req.method === 'DELETE') {
      // DELETEの場合もリクエストボディから取得を試行
      let bodyText = '';
      if (req.body) {
        const body = typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
        currentUserFingerprint = body.user_fingerprint || currentUserFingerprint;
      }
    } else if (req.method === 'GET') {
      // GET の場合はクエリパラメータから
      currentUserFingerprint = req.query.user_fingerprint || currentUserFingerprint;
    }

    // Mock data for testing - uses actual user fingerprint
    const mockThread = {
      id: id,
      title: 'テストスレッド - API修復中',
      content: 'このスレッドはAPI修復のためのテストデータです。まもなく正常なデータに戻ります。',
      category: 'テスト',
      subcategory: 'API修復',
      author_name: 'あなた',
      user_fingerprint: currentUserFingerprint, // 実際のユーザーFPを使用
      created_at: new Date().toISOString(),
      like_count: 0,
      reply_count: 0,
      hashtags: ['API修復', 'テスト'],
      images: []
    };

    const mockComment = {
      id: id,
      thread_id: 'test-thread-id',
      content: 'テストコメント',
      author_name: 'あなた',
      user_fingerprint: currentUserFingerprint, // 実際のユーザーFPを使用
      created_at: new Date().toISOString(),
      like_count: 0,
      comment_number: 1
    };

    const mockFavorite = {
      id: id,
      thread_id: 'test-thread-id',
      user_fingerprint: currentUserFingerprint, // 実際のユーザーFPを使用
      created_at: new Date().toISOString()
    };

    // Handle GET request
    if (req.method === 'GET') {
      try {
        console.log(`Fetching ${resource} with id ${id} from Supabase`);
        
        const { data, error } = await db
          .from(resource)
          .select('*')
          .eq('id', id)
          .maybeSingle();
        
        if (error) {
          console.error('Supabase GET error:', error);
          throw error;
        }
        
        if (!data) {
          console.log('No data found for', resource, id);
          return res.status(404).json({ 
            error: 'Not found',
            resource: resource,
            id: id
          });
        }
        
        console.log('Successfully fetched from Supabase:', resource, id);
        return res.status(200).json({ 
          data: data,
          debug: {
            api_version: 'supabase-connected',
            timestamp: new Date().toISOString(),
            resource: resource,
            id: id
          }
        });
        
      } catch (supabaseError) {
        console.error('Supabase error, falling back to mock data:', supabaseError);
        
        // Fallback to mock data
        let mockData;
        switch (resource) {
          case 'threads':
            mockData = mockThread;
            console.log('Fallback: Returning thread data for ID:', id);
            break;
          case 'comments':
            mockData = mockComment;
            console.log('Fallback: Returning comment data for ID:', id);
            break;
          case 'favorites':
            mockData = mockFavorite;
            console.log('Fallback: Returning favorite data for ID:', id);
            break;
          default:
            mockData = { id: id, message: `Mock ${resource} data` };
            console.log('Fallback: Returning generic mock data for resource:', resource);
        }
        
        return res.status(200).json({ 
          data: mockData,
          fallback: true,
          supabase_error: supabaseError.message,
          debug: {
            api_version: 'fallback-mock',
            timestamp: new Date().toISOString(),
            resource: resource,
            id: id
          }
        });
      }
    }

    // PATCH and DELETE methods are not supported for threads
    if (req.method === 'PATCH' || req.method === 'DELETE') {
      if (resource === 'threads') {
        return res.status(405).json({ 
          error: 'Method not allowed',
          message: 'Thread editing and deletion are not supported'
        });
      }
      
      // For other resources (comments, likes, etc.), you can add specific handling here if needed
      return res.status(405).json({ 
        error: 'Method not allowed',
        message: `${req.method} is not supported for ${resource}`
      });
    }

    return res.status(405).json({ error: 'method not allowed' });

  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message,
      details: 'Simple API implementation'
    });
  }
}