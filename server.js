import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { scan } from './checker.js';

const html = await readFile(new URL('./public/index.html', import.meta.url));
let busy = false;
http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method === 'GET' && req.url === '/health') { res.writeHead(200); return res.end('ok'); }
  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(html);
  }
  if (req.method !== 'POST' || req.url !== '/api/check') { res.writeHead(404); return res.end(); }
  res.setHeader('Content-Type', 'application/json');
  if (busy) { res.writeHead(429); return res.end(JSON.stringify({ error: 'A check is already running. Try again shortly.' })); }
  busy = true;
  try {
    let body = '';
    for await (const chunk of req) { body += chunk; if (body.length > 8192) throw new Error('Request too large.'); }
    const { url, mode = 'source', acceptCookies = false } = JSON.parse(body);
    if (typeof url !== 'string') throw new Error('Enter a website URL.');
    res.end(JSON.stringify(await scan(url, mode, { acceptCookies })));
  } catch (error) {
    res.writeHead(400); res.end(JSON.stringify({ error: error.message }));
  } finally { busy = false; }
}).listen(Number(process.env.PORT || 3000), process.env.HOST || '127.0.0.1', () => console.log('Pixel Checker listening on port ' + (process.env.PORT || 3000)));
