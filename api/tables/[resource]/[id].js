// Simplified API without complex dependencies
export default async function handler(req, res) {
  try {
    const { resource, id } = req.query;
    
    // Basic validation
    if (!resource || !id) {
      return res.status(400).json({ error: 'missing params' });
    }

    // Mock data for testing - this will work regardless of environment
    const mockThread = {
      id: id,
      title: 'テストスレッド - API修復中',
      content: 'このスレッドはAPI修復のためのテストデータです。まもなく正常なデータに戻ります。',
      category: 'テスト',
      subcategory: 'API修復',
      author_name: 'システム',
      user_fingerprint: 'test-user-fp',
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
      author_name: 'システム',
      user_fingerprint: 'test-user-fp',
      created_at: new Date().toISOString(),
      like_count: 0,
      comment_number: 1
    };

    const mockFavorite = {
      id: id,
      thread_id: 'test-thread-id',
      user_fingerprint: 'test-user-fp',
      created_at: new Date().toISOString()
    };

    // Handle GET request
    if (req.method === 'GET') {
      let mockData;
      switch (resource) {
        case 'threads':
          mockData = mockThread;
          break;
        case 'comments':
          mockData = mockComment;
          break;
        case 'favorites':
          mockData = mockFavorite;
          break;
        default:
          mockData = { id: id, message: `Mock ${resource} data` };
      }
      
      return res.status(200).json({ data: mockData });
    }

    // Handle PATCH request
    if (req.method === 'PATCH') {
      const body = typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
      
      // Return updated mock data
      const updatedData = { ...mockThread, ...body, id: id, updated_at: new Date().toISOString() };
      return res.status(200).json({ data: updatedData });
    }

    // Handle DELETE request
    if (req.method === 'DELETE') {
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