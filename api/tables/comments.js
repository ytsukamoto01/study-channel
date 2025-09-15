// Simplified comments API
export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      // Return mock comments
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

      return res.status(200).json({ data: mockComments });
    }

    if (req.method === 'POST') {
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

      return res.status(200).json({ data: newComment });
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