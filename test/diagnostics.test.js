import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from '../checker.js';
import { inspectRequest } from '../diagnostics.js';

test('extracts configured IDs for all providers without claiming source events fired', () => {
  const html = `fbq('init','123'); gtag('config','G-ABC'); gtag('config','AW-456');
    'GTM-DEF'; ttq.load('TIK123'); _linkedin_partner_id = '789'; pintrk('load','987'); snaptr('init','snap-123');`;
  const results = analyze(html);
  assert.deepEqual(results.map(result => result.pixelIds), [['123'], ['G-ABC'], ['AW-456'], ['GTM-DEF'], ['TIK123'], ['789'], ['987'], ['snap-123']]);
  for (const result of results) {
    assert.deepEqual(result.events, []);
    assert.equal(result.checks[0].status, 'passed');
    assert.equal(result.checks[1].status, 'not_tested');
    assert.equal(result.checks[2].status, 'not_tested');
    assert.equal(result.checks[3].status, 'not_tested');
  }
});

test('preserves repeated requests and groups possible duplicates by pixel ID and event', () => {
  const requests = [
    'https://www.facebook.com/tr/?id=123&ev=PageView&email=private',
    'https://www.facebook.com/tr/?id=123&ev=PageView&email=private',
    'https://www.facebook.com/tr/?id=456&ev=PageView',
    'https://www.facebook.com/tr/?id=123&ev=Lead',
  ];
  const meta = analyze('', requests, 'browser')[0];
  assert.equal(meta.requestCount, 4);
  assert.deepEqual(meta.pixelIds, ['123', '456']);
  assert.deepEqual(meta.duplicates, [{ pixelId: '123', name: 'PageView', count: 2 }]);
  assert.equal(meta.checks[2].status, 'needs_attention');
  assert.equal(meta.checks[1].status, 'passed');
  assert.ok(!JSON.stringify(meta).includes('private'));
});

test('GA POST batches parse events using the query measurement ID', () => {
  const result = inspectRequest({ url: 'https://region1.google-analytics.com/g/collect?tid=G-ABC&cid=private', postData: 'en=page_view&dl=private\nen=purchase&ep.email=private' });
  assert.deepEqual(result.events, [{pixelId:'G-ABC',name:'page_view'}, {pixelId:'G-ABC',name:'purchase'}]);
  assert.ok(!JSON.stringify(result).includes('private'));
});

test('Meta form payload parses one event, without counting query fallback twice', () => {
  const result = inspectRequest({ url: 'https://www.facebook.com/tr/?id=123&ev=PageView', postData: 'id=123&ev=PageView&ud[email]=private' });
  assert.deepEqual(result.events, [{pixelId:'123',name:'PageView'}]);
});

test('parses TikTok JSON events, Snapchat JSON, LinkedIn conversion, Pinterest and Ads', () => {
  const tiktok = inspectRequest({url:'https://analytics.tiktok.com/api/v2/pixel',postData:JSON.stringify({pixel_code:'TIK123',events:[{event:'PageView'},{event:'AddToCart'}],email:'private'})});
  assert.deepEqual(tiktok.events.map(event => event.name), ['PageView','AddToCart']);
  assert.deepEqual(tiktok.ids, ['TIK123']);
  assert.equal(inspectRequest({url:'https://tr.snapchat.com/p',postData:'{"pid":"snap-123","ev":"PAGE_VIEW"}'}).events[0].name,'PAGE_VIEW');
  assert.equal(inspectRequest('https://px.ads.linkedin.com/collect?pid=123&conversionId=456').events[0].name,'conversion');
  assert.equal(inspectRequest('https://ct.pinterest.com/v3/?tid=123&event=pagevisit').events[0].name,'pagevisit');
  assert.deepEqual(inspectRequest('https://www.googleadservices.com/pagead/conversion/123/').events,[{pixelId:'AW-123',name:'conversion'}]);
});

test('unknown formats, absent IDs, and tag libraries do not pass duplicate checks', () => {
  const empty = analyze('', [], 'browser')[0];
  assert.equal(empty.checks[2].status, 'not_tested');
  const noID = analyze('', ['https://www.facebook.com/tr/?ev=PageView'], 'browser')[0];
  assert.equal(noID.checks[2].status, 'not_tested');
  assert.equal(analyze('', ['https://connect.facebook.net/en_US/fbevents.js'], 'browser')[0].observed, false);
  assert.equal(inspectRequest('https://evilfacebook.com/tr/?id=123&ev=PageView'), null);
  assert.equal(inspectRequest('not a url'), null);
  const unknown = analyze('', [{url:'https://analytics.tiktok.com/api/v2/pixel',postData:'{"unknown":"private"}'}], 'browser').find(r=>r.name==='TikTok');
  assert.equal(unknown.observed, true);
  assert.equal(unknown.checks[1].status, 'not_tested');
});

test('different pixel IDs and different event names are not duplicates', () => {
  const meta = analyze('', ['https://www.facebook.com/tr/?id=1&ev=PageView','https://www.facebook.com/tr/?id=2&ev=PageView','https://www.facebook.com/tr/?id=1&ev=Lead'], 'browser')[0];
  assert.deepEqual(meta.duplicates, []);
  assert.equal(meta.checks[2].status, 'passed');
});

test('consent phases stay separate so before/after PageViews are not flagged as duplicates', () => {
  const request = 'https://www.facebook.com/tr/?id=1&ev=PageView';
  const observation = inspectRequest(request);
  const observations = [{...observation,phase:'before_consent'},{...observation,phase:'after_consent_attempt'}];
  let meta = analyze('', [request,request], 'browser', observations)[0];
  assert.deepEqual(meta.events.map(event=>[event.phase,event.count]), [['before_consent',1],['after_consent_attempt',1]]);
  assert.deepEqual(meta.duplicates, []);
  meta = analyze('', [request,request,request], 'browser', [...observations,observations[1]])[0];
  assert.equal(meta.duplicates[0].phase,'after_consent_attempt');
  assert.equal(meta.duplicates[0].count,2);
});
