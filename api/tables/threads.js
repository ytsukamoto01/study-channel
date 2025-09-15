// Simplified threads API without complex dependencies
export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      // Return mock thread list
      const mockThreads = [
        {
          id: '40c41e65-d184-4e16-b75b-e432777ce5ac',
          title: 'API修復テストスレッド 1',
          content: 'このスレッドはAPI修復のためのテストデータです。',
          category: 'テスト',
          subcategory: 'API修復',
          author_name: 'システム',
          user_fingerprint: 'test-user-1',
          created_at: new Date(Date.now() - 60000).toISOString(),
          like_count: 5,
          reply_count: 3,
          hashtags: ['API修復', 'テスト'],
          images: []
        },
        {
          id: '50c41e65-d184-4e16-b75b-e432777ce5ac',
          title: 'API修復テストスレッド 2',
          content: '二つ目のテストスレッドです。編集・削除機能のテスト用です。',
          category: 'テスト',
          subcategory: '機能テスト',
          author_name: 'テストユーザー',
          user_fingerprint: 'test-user-2',
          created_at: new Date(Date.now() - 120000).toISOString(),
          like_count: 2,
          reply_count: 1,
          hashtags: ['機能テスト'],
          images: []
        }
      ];

      return res.status(200).json({ data: mockThreads });
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