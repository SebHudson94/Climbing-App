// Minimal server: serves the front end and proxies /api/messages to the Google Gemini API.
// The API key stays here on the server and is never sent to the browser.
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const MAX_TOKENS = Math.min(parseInt(process.env.MAX_TOKENS || '2000', 10), 4000);
const MAX_BODY = 10 * 1024 * 1024; // photos are downscaled client-side, so 10 MB is ample
const PUBLIC_DIR = path.join(__dirname, 'public');
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',').map(o => o.trim()).filter(Boolean);

function send(res, status, body, type = 'application/json') {
  res.writeHead(status, { 'Content-Type': type });
  if (Buffer.isBuffer(body) || typeof body === 'string') return res.end(body);
  res.end(JSON.stringify(body));
}

// Allow only the origins listed in ALLOWED_ORIGINS (e.g. your GitHub Pages site).
function applyCors(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Vary', 'Origin');
  }
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

// The front end sends content blocks in the form { type: 'text' | 'image', ... }.
// Convert them to Gemini's parts format.
function toGeminiParts(content) {
  if (typeof content === 'string') return [{ text: content }];
  return content.map(block => block.type === 'image'
    ? { inline_data: { mime_type: block.source.media_type, data: block.source.data } }
    : { text: block.text || '' });
}

async function handleMessages(req, res) {
  if (!API_KEY) {
    return send(res, 500, { error: 'GEMINI_API_KEY is not set on the server' });
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

  const contents = input.messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: toGeminiParts(m.content),
  }));

  // The client cannot choose the model or token limit: the server decides both.
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL)}:generateContent`;
  const upstream = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': API_KEY },
    body: JSON.stringify({
      contents,
      generationConfig: { maxOutputTokens: MAX_TOKENS, responseMimeType: 'application/json' },
    }),
  });
  const data = await upstream.json().catch(() => ({}));
  if (!upstream.ok) {
    return send(res, upstream.status, { error: (data.error && data.error.message) || 'Upstream error' });
  }

  // Return the reply in the shape the front end already reads.
  const text = ((data.candidates && data.candidates[0] && data.candidates[0].content.parts) || [])
    .map(p => p.text || '').join('');
  send(res, 200, { content: [{ type: 'text', text }] });
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
    applyCors(req, res);
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      return res.end();
    }
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
  if (!API_KEY) console.warn('Warning: GEMINI_API_KEY is not set');
});
