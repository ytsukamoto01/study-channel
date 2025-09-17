const http = require('http');
const url = require('url');
const path = require('path');
const fs = require('fs');

const port = 3000;

// Mock data handlers - same as test server but for port 3000
function handleThreadsAPI(req, res, query) {
  const userFingerprint = query.user_fingerprint;
  console.log('GET /api/tables/threads - userFingerprint:', userFingerprint);
  
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
      user_fingerprint: requestedUserFP,
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
      user_fingerprint: requestedUserFP,
      created_at: new Date(Date.now() - 120000).toISOString(),
      like_count: 2,
      reply_count: 1,
      hashtags: ['機能テスト', '自分の投稿'],
      images: []
    }
  ];

  // Other users' threads
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

  // Return only user threads if user_fingerprint specified
  const threadsToReturn = userFingerprint ? userMockThreads : [...userMockThreads, ...otherMockThreads];
  
  console.log('Threads to return count:', threadsToReturn.length);
  console.log('User threads created for FP:', requestedUserFP);
  
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ data: threadsToReturn }));
}

function handleCommentsAPI(req, res, query) {
  console.log('GET /api/tables/comments - query:', query);
  
  const threadId = query.thread_id;
  
  // Mock comments data
  const mockComments = [
    {
      id: 'comment-1',
      thread_id: '40c41e65-d184-4e16-b75b-e432777ce5ac',
      content: '実際のSupabaseコメント1です。テストデータではありません。',
      author_name: 'テストユーザーA',
      user_fingerprint: 'test-user-a',
      created_at: new Date(Date.now() - 300000).toISOString(),
      like_count: 2,
      comment_number: 1,
      parent_comment_id: null
    },
    {
      id: 'comment-2',
      thread_id: '40c41e65-d184-4e16-b75b-e432777ce5ac',
      content: '2番目のSupabaseコメントです。',
      author_name: 'テストユーザーB',
      user_fingerprint: 'test-user-b',
      created_at: new Date(Date.now() - 200000).toISOString(),
      like_count: 1,
      comment_number: 2,
      parent_comment_id: null
    },
    {
      id: 'comment-reply-1',
      thread_id: '40c41e65-d184-4e16-b75b-e432777ce5ac',
      content: 'コメント1への返信です。',
      author_name: 'テストユーザーC',
      user_fingerprint: 'test-user-c',
      created_at: new Date(Date.now() - 100000).toISOString(),
      like_count: 0,
      comment_number: 3,
      parent_comment_id: 'comment-1'
    }
  ];

  // Filter by thread_id if specified
  const filteredComments = threadId 
    ? mockComments.filter(c => c.thread_id === threadId)
    : mockComments;
  
  console.log('Comments to return count:', filteredComments.length);
  
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ data: filteredComments }));
}

// Mock storage
let mockFavorites = [];
let mockCommentsStorage = [];

function handleFavoritesAPI(req, res, query, body = {}) {
  console.log(`${req.method} /api/tables/favorites - query:`, query, 'body:', body);
  
  if (req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ data: mockFavorites }));
  } else if (req.method === 'POST') {
    const newFavorite = {
      id: `fav-${Date.now()}`,
      thread_id: body.thread_id,
      user_fingerprint: body.user_fingerprint || 'anonymous',
      created_at: new Date().toISOString()
    };
    
    // Check if already exists
    const existing = mockFavorites.find(f => 
      f.thread_id === newFavorite.thread_id && 
      f.user_fingerprint === newFavorite.user_fingerprint
    );
    
    if (!existing) {
      mockFavorites.push(newFavorite);
    }
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ data: newFavorite }));
  } else if (req.method === 'DELETE') {
    const { thread_id, user_fingerprint } = body;
    
    if (!thread_id || !user_fingerprint) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        error: 'missing fields: thread_id and user_fingerprint required' 
      }));
      return;
    }
    
    const initialLength = mockFavorites.length;
    mockFavorites = mockFavorites.filter(f => 
      !(f.thread_id === thread_id && f.user_fingerprint === user_fingerprint)
    );
    
    const deletedCount = initialLength - mockFavorites.length;
    console.log(`Deleted ${deletedCount} favorites`);
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      data: [], 
      message: 'Favorite removed successfully' 
    }));
  } else {
    res.writeHead(405);
    res.end();
  }
}

// Mock likes storage
let mockLikes = [];

function handleLikesAPI(req, res, query, body = {}) {
  console.log(`${req.method} /api/tables/likes - query:`, query, 'body:', body);
  
  if (req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ data: mockLikes }));
  } else if (req.method === 'POST') {
    const newLike = {
      id: `like-${Date.now()}`,
      target_type: body.target_type,
      target_id: body.target_id,
      user_fingerprint: body.user_fingerprint || 'anonymous',
      created_at: new Date().toISOString()
    };
    
    // Check if already exists
    const existing = mockLikes.find(l => 
      l.target_type === newLike.target_type &&
      l.target_id === newLike.target_id && 
      l.user_fingerprint === newLike.user_fingerprint
    );
    
    if (!existing) {
      mockLikes.push(newLike);
    }
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ data: newLike }));
  } else if (req.method === 'DELETE') {
    const { target_type, target_id, user_fingerprint } = body;
    
    if (!target_type || !target_id || !user_fingerprint) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        error: 'missing fields: target_type, target_id and user_fingerprint required' 
      }));
      return;
    }
    
    const initialLength = mockLikes.length;
    mockLikes = mockLikes.filter(l => 
      !(l.target_type === target_type && l.target_id === target_id && l.user_fingerprint === user_fingerprint)
    );
    
    const deletedCount = initialLength - mockLikes.length;
    console.log(`Deleted ${deletedCount} likes`);
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      data: [], 
      message: 'Like removed successfully' 
    }));
  } else {
    res.writeHead(405);
    res.end();
  }
}

function handleResourceIdAPI(req, res, resource, id, body = {}) {
  console.log(`${req.method} /api/tables/${resource}/${id}`);
  console.log('Request body:', body);
  console.log('Request headers:', req.headers);
  
  try {
    const currentUserFingerprint = body.user_fingerprint || 'default-user-fp';
  
  if (req.method === 'GET') {
    const mockThread = {
      id: id,
      title: 'テストスレッド - API修復中',
      content: 'このスレッドはAPI修復のためのテストデータです。まもなく正常なデータに戻ります。',
      category: 'テスト',
      subcategory: 'API修復',
      author_name: 'あなた',
      user_fingerprint: currentUserFingerprint,
      created_at: new Date().toISOString(),
      like_count: 0,
      reply_count: 0,
      hashtags: ['API修復', 'テスト'],
      images: []
    };
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ data: mockThread }));
  } else if (req.method === 'PATCH' || req.method === 'DELETE') {
    console.log(`${req.method} request not supported for threads`);
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      error: 'Method not allowed',
      message: 'Thread editing and deletion are not supported'
    }));
  } else {
    console.log('Unsupported method:', req.method);
    res.writeHead(405);
    res.end();
  }
  
  } catch (error) {
    console.error('API error in handleResourceIdAPI:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Internal server error', details: error.message }));
  }
}

// Serve static files
function serveFile(res, filePath, contentType = 'text/html') {
  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
  });
}

const server = http.createServer((req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }
  
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  
  // Handle request body
  let body = '';
  req.on('data', chunk => {
    body += chunk.toString();
  });
  
  req.on('end', () => {
    let parsedBody = {};
    if (body) {
      try {
        parsedBody = JSON.parse(body);
      } catch (e) {
        // Ignore parse errors
      }
    }
    
    // API routes
    if (pathname === '/api/tables/threads') {
      handleThreadsAPI(req, res, parsedUrl.query);
    } else if (pathname === '/api/tables/comments') {
      if (req.method === 'GET') {
        handleCommentsAPI(req, res, parsedUrl.query);
      } else if (req.method === 'POST') {
        console.log('POST /api/tables/comments - body:', parsedBody);
        
        // Calculate next comment number for this thread (simulate database count)
        const threadId = parsedBody.thread_id;
        if (!global.mockCommentsStorage) {
          global.mockCommentsStorage = [];
        }
        const existingCommentsForThread = global.mockCommentsStorage.filter(c => c.thread_id === threadId);
        const nextCommentNumber = existingCommentsForThread.length + 1;
        
        const newComment = {
          id: `comment-${Date.now()}`,
          thread_id: parsedBody.thread_id,
          content: parsedBody.content || 'New comment',
          images: Array.isArray(parsedBody.images) ? parsedBody.images : [],
          author_name: parsedBody.author_name || '匿名',
          user_fingerprint: parsedBody.user_fingerprint || 'anonymous',
          created_at: new Date().toISOString(),
          like_count: 0,
          comment_number: nextCommentNumber,
          parent_comment_id: parsedBody.parent_comment_id || null
        };
        
        // Store comment for future requests (in-memory storage)
        if (!global.mockCommentsStorage) {
          global.mockCommentsStorage = [];
        }
        global.mockCommentsStorage.push(newComment);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ data: newComment }));
      } else {
        res.writeHead(405);
        res.end();
      }
    } else if (pathname === '/api/tables/favorites') {
      handleFavoritesAPI(req, res, parsedUrl.query, parsedBody);
    } else if (pathname === '/api/tables/likes') {
      handleLikesAPI(req, res, parsedUrl.query, parsedBody);
    } else if (pathname === '/api/debug/supabase-test') {
      // Supabase connection test
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        message: 'No Supabase environment variables configured',
        envVars: {
          SUPABASE_URL: false,
          SUPABASE_ANON_KEY: false,
          SUPABASE_SERVICE_ROLE_KEY: false
        },
        error: 'This is a mock server. Real Supabase connection requires environment variables.',
        recommendation: 'Set up Supabase project and configure environment variables'
      }));
    } else if (pathname.match(/^\/api\/tables\/[^\/]+\/[^\/]+$/)) {
      const parts = pathname.split('/');
      const resource = parts[3];
      const id = parts[4];
      handleResourceIdAPI(req, res, resource, id, parsedBody);
    } else if (pathname === '/' || pathname === '/index.html') {
      serveFile(res, 'index.html');
    } else if (pathname === '/myposts.html' || pathname === '/myposts') {
      serveFile(res, 'myposts.html');
    } else if (pathname === '/thread.html' || pathname === '/thread') {
      serveFile(res, 'thread.html');
    } else if (pathname === '/test-myposts.html' || pathname === '/test-myposts') {
      serveFile(res, 'test-myposts.html');
    } else if (pathname.startsWith('/js/')) {
      serveFile(res, pathname.substring(1), 'application/javascript');
    } else if (pathname.startsWith('/css/')) {
      serveFile(res, pathname.substring(1), 'text/css');
    } else if (pathname.startsWith('/favicon') || pathname.endsWith('.png') || pathname.endsWith('.ico')) {
      serveFile(res, pathname.substring(1), 'image/png');
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  });
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Study Channel server running at http://localhost:${port}/`);
  console.log(`Server accessible externally on port ${port}`);
});