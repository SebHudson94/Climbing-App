// Minimal server: serves the front end and proxies /api/messages to the Anthropic API.
// The API key stays here on the server and is never sent to the browser.
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-5-5';
const MAX_TOKENS = Math.min(parseInt(process.env.MAX_TOKENS || '1000', 10), 2000);
const MAX_BODY = 10 * 1024 * 1024; // photos are downscaled client-side, so 10 MB is ample
const PUBLIC_DIR = path.join(__dirname, 'public');
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

function send(res, status, body, type = 'application/json') {
  res.writeHead(status, { 'Content-Type': type });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

async function readBody(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) {
      const err = new Error('Payload too large');
      err.status = 413;
      throw err;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function handleMessages(req, res) {
  if (!API_KEY) {
    return send(res, 500, { error: 'ANTHROPIC_API_KEY is not set on the server' });
  }
  let input;
  try {
    input = JSON.parse(await readBody(req));
  } catch (err) {
    return send(res, err.status || 400, { error: err.status === 413 ? 'Payload too large' : 'Invalid JSON' });
  }
  if (!Array.isArray(input.messages)) {
    return send(res, 400, { error: 'messages array required' });
  }
  // The client cannot choose the model or token limit: the server decides both.
  const upstream = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({ model: MODEL, max_tokens: MAX_TOKENS, messages: input.messages }),
  });
  send(res, upstream.status, await upstream.text());
}

function serveStatic(req, res) {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  const file = path.normalize(path.join(PUBLIC_DIR, urlPath === '/' ? 'index.html' : urlPath));
  if (!file.startsWith(PUBLIC_DIR)) return send(res, 403, 'Forbidden', 'text/plain');
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, 'Not found', 'text/plain');
    send(res, 200, data, TYPES[path.extname(file)] || 'application/octet-stream');
  });
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'POST' && req.url === '/api/messages') {
      return await handleMessages(req, res);
    }
    if (req.method === 'GET' || req.method === 'HEAD') {
      return serveStatic(req, res);
    }
    send(res, 405, 'Method not allowed', 'text/plain');
  } catch (err) {
    console.error(err);
    send(res, 500, { error: 'Server error' });
  }
});

server.listen(PORT, () => {
  console.log(`Route Analyser running at http://localhost:${PORT}`);
  if (!API_KEY) console.warn('Warning: ANTHROPIC_API_KEY is not set');
});
