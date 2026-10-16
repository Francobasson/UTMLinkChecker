import test from 'node:test';
import assert from 'node:assert/strict';
import { observeConsent } from '../consent.js';
import { scan } from '../checker.js';

test('default browser observation never tries to click consent', async () => {
  const waits = [];
  const result = await observeConsent({waitForTimeout:async ms=>waits.push(ms)},false,()=>assert.fail('phase changed'));
  assert.equal(result.status,'not_requested');
  assert.deepEqual(waits,[5000]);
});

test('missing banner does not invent consent or a post-consent phase', async () => {
  const waits = [];
  const result = await observeConsent({waitForTimeout:async ms=>waits.push(ms),frames:()=>[]},true,()=>assert.fail('phase changed'));
  assert.equal(result.status,'not_found');
  assert.deepEqual(waits,[5000]);
});

test('source mode and non-boolean consent options are rejected', async () => {
  await assert.rejects(scan('https://example.com','source',{acceptCookies:true}),/requires Browser/);
  await assert.rejects(scan('https://example.com','browser',{acceptCookies:'false'}),/true or false/);
});
