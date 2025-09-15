// Simplified favorites API
export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      // Return mock favorites
      const mockFavorites = [
        {
          id: 'fav-1',
          thread_id: '40c41e65-d184-4e16-b75b-e432777ce5ac',
          user_fingerprint: 'test-user-fp',
          created_at: new Date().toISOString()
        }
      ];

      return res.status(200).json({ data: mockFavorites });
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
      
      const newFavorite = {
        id: `fav-${Date.now()}`,
        thread_id: body.thread_id,
        user_fingerprint: body.user_fingerprint,
        created_at: new Date().toISOString()
      };

      return res.status(201).json(newFavorite);
    }

    if (req.method === 'DELETE') {
      return res.status(204).end();
    }

    return res.status(405).json({ error: 'method not allowed' });

  } catch (error) {
    console.error('Favorites API Error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
}