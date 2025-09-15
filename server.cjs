const http = require('http');
const url = require('url');
const path = require('path');
const fs = require('fs');

// Import API handlers
const threadsHandler = require('./api/tables/threads.js').default;
const resourceIdHandler = require('./api/tables/[resource]/[id].js').default;

const port = 3000;

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
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  // API routes
  if (pathname === '/api/tables/threads') {
    threadsHandler(req, res);
  } else if (pathname.match(/^\/api\/tables\/[^\/]+\/[^\/]+$/)) {
    // Extract resource and id from URL
    const parts = pathname.split('/');
    const resource = parts[3];
    const id = parts[4];
    
    req.query = { ...parsedUrl.query, resource, id };
    resourceIdHandler(req, res);
  } else if (pathname === '/' || pathname === '/index.html') {
    serveFile(res, 'index.html');
  } else if (pathname === '/myposts.html' || pathname === '/myposts') {
    serveFile(res, 'myposts.html');
  } else if (pathname === '/thread.html' || pathname === '/thread') {
    serveFile(res, 'thread.html');
  } else if (pathname.startsWith('/js/')) {
    serveFile(res, pathname.substring(1), 'application/javascript');
  } else if (pathname.startsWith('/css/')) {
    serveFile(res, pathname.substring(1), 'text/css');
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(port, () => {
  console.log(`Server running at http://localhost:${port}/`);
});