import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze, validateURL, scan } from '../checker.js';

test('distinguishes embedded tags from observed events and strips query data', () => {
  const results = analyze("fbq('init', '123'); ttq.load('abc');", ['https://www.facebook.com/tr/?id=123&email=private']);
  assert.equal(results.find(r => r.name === 'Meta').observed, true);
  assert.deepEqual(results[0].requests, ['https://www.facebook.com/tr/']);
  assert.equal(results.find(r => r.name === 'TikTok').detected, true);
  assert.equal(results.find(r => r.name === 'TikTok').observed, false);
  assert.equal(results.find(r => r.name === 'Pinterest').detected, false);
});
test('loading a library alone does not claim an event', () => {
  const [meta] = analyze('', ['https://connect.facebook.net/en_US/fbevents.js']);
  assert.equal(meta.detected, true); assert.equal(meta.observed, false);
});
test('rejects local destinations and unsupported protocols', async () => {
  for (const url of ['http://127.0.0.1', 'http://10.0.0.1', 'http://169.254.169.254', 'http://[::1]', 'file:///etc/passwd', 'https://user:pass@example.com']) await assert.rejects(validateURL(url));
});

test('detects all supported providers from a representative HTML page', () => {
  const html = `<script>fbq('init','123'); gtag('config','G-ABC123'); gtag('config','AW-123');
  ttq.load('123'); var _linkedin_partner_id='123'; pintrk('load','123'); snaptr('init','123');</script>
  <script src="https://www.googletagmanager.com/gtm.js?id=GTM-ABC"></script>`;
  const results = analyze(html);
  assert.equal(results.length, 8);
  assert.ok(results.every(result => result.detected && !result.observed));
  assert.ok(analyze('<html><h1>No tracking</h1></html>').every(result => !result.detected));
});

test('source mode fetches HTML and does not claim firing', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response("<script>fbq('init','123')</script>", { headers: { 'content-type': 'text/html' } }));
  const result = await scan('https://93.184.216.34');
  assert.equal(result.status, 200);
  assert.equal(result.mode, 'source');
  assert.equal(result.results[0].detected, true);
  assert.equal(result.results[0].observed, false);
});

test('source mode blocks a redirect to a private address', async t => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    return new Response(null, { status: 302, headers: { location: 'http://127.0.0.1' } });
  });
  await assert.rejects(scan('https://93.184.216.34'), /public website/);
  assert.equal(calls, 1);
});

test('source mode reports HTTP failures', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response('Unavailable', { status: 503 }));
  await assert.rejects(scan('https://93.184.216.34'), /503/);
});
