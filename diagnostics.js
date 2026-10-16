// Keep only identifiers and event names: never return raw payloads or user data.
const safe = value => typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,100}$/.test(value) ? value : null;
const hostIs = (host, domain) => host === domain || host.endsWith('.' + domain);

export function inspectRequest(request) {
  const { url, postData = '' } = typeof request === 'string' ? { url: request } : request;
  let parsed;
  try { parsed = new URL(url); } catch { return null; }
  const host = parsed.hostname, path = parsed.pathname;
  let provider;
  if (hostIs(host, 'facebook.com') && /^\/tr\/?$/.test(path)) provider = 'Meta';
  else if (hostIs(host, 'google-analytics.com') && /\/(?:g\/)?collect$/.test(path)) provider = 'Google Analytics';
  else if ((hostIs(host, 'googleadservices.com') || host === 'googleads.g.doubleclick.net') && path.startsWith('/pagead/')) provider = 'Google Ads';
  else if (host === 'analytics.tiktok.com' && path.startsWith('/api/')) provider = 'TikTok';
  else if (host === 'px.ads.linkedin.com' && path.startsWith('/collect')) provider = 'LinkedIn';
  else if (host === 'ct.pinterest.com') provider = 'Pinterest';
  else if (host === 'tr.snapchat.com') provider = 'Snapchat';
  if (!provider) return null;
  const events = [];
  const ids = new Set();
  const add = (id, event) => {
    id = safe(id); event = safe(event);
    if (id) ids.add(id);
    if (event) events.push({ pixelId: id, name: event });
  };
  const query = parsed.searchParams;
  const records = [];
  if (postData && postData.length <= 65536) {
    // GA4 can batch newline-separated URL-encoded events.
    for (const line of postData.split('\n').slice(0, 100)) {
      if (!postData.trim().startsWith('{') && !postData.trim().startsWith('[') && line.includes('=')) records.push(new URLSearchParams(line));
    }
  }
  if (!records.length) records.push(query);
  for (const body of records) {
    const get = key => body.get(key) || query.get(key);
    if (provider === 'Meta') add(get('id'), get('ev'));
    if (provider === 'Google Analytics') add(get('tid'), get('en') || get('ea') || (get('t') === 'pageview' ? 'page_view' : null));
    if (provider === 'Google Ads') {
      const id = path.match(/\/(?:conversion|viewthroughconversion)\/(\d+)/)?.[1];
      add(id ? 'AW-' + id : get('tid'), get('en') || (path.includes('conversion/') ? 'conversion' : null));
    }
    if (provider === 'TikTok') add(get('pixel_code'), get('event'));
    if (provider === 'LinkedIn') add(get('pid'), get('conversionId') ? 'conversion' : null);
    if (provider === 'Pinterest') add(get('tid'), get('event'));
    if (provider === 'Snapchat') add(get('pid'), get('ev'));
  }
  try {
    const body = postData.length <= 65536 ? JSON.parse(postData) : null;
    if (!body || typeof body !== 'object') return { provider, ids: [...ids], events };
    if (provider === 'TikTok') {
      const batch = Array.isArray(body.events) ? body.events : [body];
      for (const item of batch.slice(0, 100)) add(item.pixel_code || body.pixel_code, item.event);
    }
    if (provider === 'Snapchat') {
      for (const item of (Array.isArray(body) ? body : [body]).slice(0, 100)) add(item.pid, item.ev);
    }
  } catch { /* Unknown bodies remain unparsed, not invented events. */ }
  return { provider, ids: [...ids], events };
}

const sourcePatterns = {
  Meta: /\bfbq\s*\(\s*['"]init['"]\s*,\s*['"](\d+)['"]/g,
  'Google Analytics': /\b((?:G-[A-Z0-9]+|UA-\d+-\d+))\b/g,
  'Google Ads': /\b(AW-\d+)\b/g,
  'Google Tag Manager': /\b(GTM-[A-Z0-9]+)\b/g,
  TikTok: /\bttq\.load\s*\(\s*['"]([A-Za-z0-9]+)['"]/g,
  LinkedIn: /_linkedin_partner_id\s*=\s*['"](\d+)['"]/g,
  Pinterest: /\bpintrk\s*\(\s*['"]load['"]\s*,\s*['"](\d+)['"]/g,
  Snapchat: /\bsnaptr\s*\(\s*['"]init['"]\s*,\s*['"]([A-Za-z0-9-]+)['"]/g,
};

export function addDiagnostics(results, html, observations, mode) {
  return results.map(result => {
    const ids = new Set([...html.matchAll(sourcePatterns[result.name])].map(match => match[1]));
    const groups = new Map();
    let requestCount = 0;
    for (const observation of observations.filter(item => item?.provider === result.name)) {
      requestCount++;
      observation.ids.forEach(id => ids.add(id));
      for (const event of observation.events) {
        const key = JSON.stringify([event.pixelId, event.name]);
        const group = groups.get(key) || { ...event, count: 0 };
        group.count++; groups.set(key, group);
      }
    }
    const events = [...groups.values()];
    const duplicates = events.filter(event => event.pixelId && event.count > 1);
    const duplicatesTested = mode === 'browser' && events.length > 0 && events.every(event => event.pixelId);
    const container = result.name === 'Google Tag Manager';
    return { ...result, observed: requestCount > 0, pixelIds: [...ids], events, requestCount, duplicates,
      checks: [
        { label: container ? 'Container ID' : 'Pixel / tag ID', status: ids.size ? 'passed' : 'not_tested', detail: ids.size ? 'ID found; compare it with the client’s account.' : 'No readable ID found.' },
        { label: 'Event requests', status: container || mode !== 'browser' || !events.length ? 'not_tested' : 'passed', detail: container ? 'Tag Manager loads other tags; it is not an event pixel.' : mode !== 'browser' ? 'Use Browser visit to observe events.' : events.length ? 'Named event requests observed. Delivery is not verified.' : 'No named event observed during this visit; consent or delayed loading may affect results.' },
        { label: 'Duplicate events', status: duplicates.length ? 'needs_attention' : duplicatesTested ? 'passed' : 'not_tested', detail: duplicates.length ? 'Repeated event names for the same ID during one visit. Review possible duplicates; retries and legitimate repeat actions can also cause this.' : duplicatesTested ? 'No repeated named events for the same known ID in this visit.' : 'Not enough event evidence to check duplicates.' },
        { label: 'Account ownership, delivery & conversion journey', status: 'not_tested', detail: 'Confirm ownership and receipt in the provider’s Events Manager. Checkout, consent behavior, and conversion actions were not tested.' },
      ] };
  });
}
