// Simplified API without complex dependencies
export default async function handler(req, res) {
  try {
    console.log('=== API Request ===');
    console.log('Method:', req.method);
    console.log('URL:', req.url);
    console.log('Query:', req.query);
    
    const { resource, id } = req.query;
    
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
      let mockData;
      switch (resource) {
        case 'threads':
          mockData = mockThread;
          console.log('Returning thread data for ID:', id);
          break;
        case 'comments':
          mockData = mockComment;
          console.log('Returning comment data for ID:', id);
          break;
        case 'favorites':
          mockData = mockFavorite;
          console.log('Returning favorite data for ID:', id);
          break;
        default:
          mockData = { id: id, message: `Mock ${resource} data` };
          console.log('Returning generic mock data for resource:', resource);
      }
      
      console.log('Mock data generated:', JSON.stringify(mockData, null, 2));
      return res.status(200).json({ 
        data: mockData,
        debug: {
          api_version: 'simplified-mock',
          timestamp: new Date().toISOString(),
          resource: resource,
          id: id
        }
      });
    }

    // Handle PATCH request
    if (req.method === 'PATCH') {
      const body = typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
      
      // For testing: Skip ownership check and allow all edits
      console.log('PATCH request - Test mode: allowing all edits');
      
      // Return updated mock data with actual submitted values
      const updatedData = {
        id: id,
        title: body.title || mockThread.title,
        content: body.content || mockThread.content,
        category: body.category || mockThread.category,
        subcategory: body.subcategory || mockThread.subcategory,
        hashtags: body.hashtags || mockThread.hashtags,
        images: body.images || mockThread.images,
        author_name: mockThread.author_name,
        user_fingerprint: body.user_fingerprint || mockThread.user_fingerprint,
        created_at: mockThread.created_at,
        updated_at: new Date().toISOString(),
        like_count: mockThread.like_count,
        reply_count: mockThread.reply_count
      };
      
      return res.status(200).json({ data: updatedData });
    }

    // Handle DELETE request  
    if (req.method === 'DELETE') {
      console.log('DELETE request - Test mode: allowing all deletes');
      // For testing: Skip ownership check and allow all deletes
      return res.status(204).end();
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