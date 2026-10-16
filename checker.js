import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

const providers = [
  ['Meta', /connect\.facebook\.net|facebook\.com\/tr(?:[/?]|$)|\bfbq\s*\(/i, /facebook\.com\/tr(?:[/?]|$)/i],
  ['Google Analytics', /google-analytics\.com|\bG-[A-Z0-9]+\b|\bUA-\d+-\d+\b/i, /google-analytics\.com\/(?:g\/)?collect/i],
  ['Google Ads', /googleadservices\.com|googleads\.g\.doubleclick\.net|\bAW-\d+/i, /googleadservices\.com\/pagead|googleads\.g\.doubleclick\.net\/pagead/i],
  ['Google Tag Manager', /googletagmanager\.com\/gtm\.js|\bGTM-[A-Z0-9]+/i, /googletagmanager\.com\/gtm\.js/i],
  ['TikTok', /analytics\.tiktok\.com|\bttq\s*\./i, /analytics\.tiktok\.com\/api/i],
  ['LinkedIn', /snap\.licdn\.com|px\.ads\.linkedin\.com|_linkedin_partner_id/i, /px\.ads\.linkedin\.com\/collect/i],
  ['Pinterest', /s\.pinimg\.com\/ct|ct\.pinterest\.com|\bpintrk\s*\(/i, /ct\.pinterest\.com/i],
  ['Snapchat', /sc-static\.net\/scevent|tr\.snapchat\.com|\bsnaptr\s*\(/i, /tr\.snapchat\.com/i],
];

export function analyze(html, requests = []) {
  return providers.map(([name, source, event]) => {
    const matches = [...new Set(requests.filter(url => source.test(url)))];
    return { name, detected: source.test(html) || matches.length > 0,
      observed: matches.some(url => event.test(url)), requests: [...new Set(matches.map(url => {
        const parsed = new URL(url); return parsed.origin + parsed.pathname;
      }))] };
  });
}

function publicIP(address) {
  if (isIP(address) === 6) return /^[23]/i.test(address) && !/^(2001:|2002:|3fff:)/i.test(address);
  const [a, b] = address.split('.').map(Number);
  return isIP(address) === 4 && a !== 0 && a !== 10 && a !== 127 &&
    !(a === 169 && b === 254) && !(a === 172 && b >= 16 && b <= 31) &&
    !(a === 192 && (b === 168 || b === 0)) && !(a === 100 && b >= 64 && b <= 127) &&
    !(a === 198 && (b === 18 || b === 19)) && a < 224;
}

export async function validateURL(value) {
  const url = new URL(value);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password ||
      (url.port && !['80', '443'].includes(url.port))) throw new Error('Use a public HTTP or HTTPS URL on a standard port.');
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = await lookup(hostname, { all: true });
  if (!addresses.length || addresses.some(({ address }) => !publicIP(address))) throw new Error('Only public website addresses are supported.');
  return url.href;
}

export async function fetchSource(value) {
  let url = value;
  for (let redirects = 0; redirects < 6; redirects++) {
    url = await validateURL(url);
    const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(15000) });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel();
      const location = response.headers.get('location');
      if (!location) throw new Error('Redirect is missing its destination.');
      url = new URL(location, url).href; continue;
    }
    if (!response.ok) { await response.body?.cancel(); throw new Error(`Website returned HTTP ${response.status}.`); }
    if (!/text\/html|application\/xhtml\+xml/i.test(response.headers.get('content-type') || '')) {
      await response.body?.cancel(); throw new Error('The URL must return an HTML page.');
    }
    let size = 0; const chunks = [];
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > 2 * 1024 * 1024) throw new Error('Page exceeds the 2 MB source limit.');
      chunks.push(chunk);
    }
    return { url, status: response.status, html: Buffer.concat(chunks).toString('utf8') };
  }
  throw new Error('Too many redirects.');
}

export async function scan(value, mode = 'source') {
  const url = await validateURL(value);
  if (mode === 'source') {
    const page = await fetchSource(url);
    return { url: page.url, status: page.status, mode, results: analyze(page.html),
      note: 'Source-only check. JavaScript was not executed; firing was not tested.' };
  }
  if (mode !== 'browser') throw new Error('Unknown check mode.');
  const { chromium } = await import('playwright');
  let browser;
  try { browser = await chromium.launch({ headless: true }); }
  catch { throw new Error('Browser mode requires Chromium. Install it with: npx playwright install chromium. Source-only mode is available now.'); }
  try {
    const context = await browser.newContext({ serviceWorkers: 'block', acceptDownloads: false });
    await context.route('**/*', async route => {
      try { await validateURL(route.request().url()); await route.continue(); }
      catch { await route.abort(); }
    });
    const page = await context.newPage();
    const requests = [];
    page.on('request', request => requests.push(request.url()));
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await page.waitForTimeout(5000);
    return { url: page.url(), status: response?.status(), mode, results: analyze(await page.content(), requests),
      note: 'Observed means a matching request was attempted, not that an event was accepted. No consent buttons were clicked.' };
  } finally { await browser.close(); }
}
