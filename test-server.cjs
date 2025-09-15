const http = require('http');
const url = require('url');
const path = require('path');
const fs = require('fs');

const port = 3001;

// Mock data handlers
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

function handleResourceIdAPI(req, res, resource, id, body = {}) {
  console.log(`${req.method} /api/tables/${resource}/${id}`);
  
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
  } else if (req.method === 'PATCH') {
    console.log('PATCH request - Test mode: allowing all edits');
    
    const updatedData = {
      id: id,
      title: body.title || 'Updated Test Thread',
      content: body.content || 'Updated content',
      category: body.category || 'テスト',
      subcategory: body.subcategory || 'API修復',
      hashtags: body.hashtags || ['API修復', 'テスト'],
      images: body.images || [],
      author_name: 'あなた',
      user_fingerprint: currentUserFingerprint,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      like_count: 0,
      reply_count: 0
    };
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ data: updatedData }));
  } else if (req.method === 'DELETE') {
    console.log('DELETE request - Test mode: allowing all deletes');
    res.writeHead(204);
    res.end();
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
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  });
});

server.listen(port, () => {
  console.log(`Test server running at http://localhost:${port}/`);
});