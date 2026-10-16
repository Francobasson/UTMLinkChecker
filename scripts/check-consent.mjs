import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { attemptCookieConsent, observeConsent } from '../consent.js';
import { analyze } from '../checker.js';

const browser = await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE_PATH ? {executablePath:process.env.BROWSER_EXECUTABLE_PATH} : {})});
try {
  const page = await browser.newPage();
  await page.setContent(`<button id="onetrust-accept-btn-handler" onclick="window.accepted=true;this.remove()">Accept All Cookies</button>`);
  let phase;
  assert.equal((await attemptCookieConsent(page,next=>{phase='after_consent_attempt'})).status,'clicked');
  assert.equal(await page.evaluate(()=>window.accepted),true);
  assert.equal(phase,'after_consent_attempt');
  await page.setContent('<button onclick="window.wrongClick=true">Accept all</button><button id="onetrust-accept-btn-handler" hidden>Accept All Cookies</button>');
  assert.equal((await attemptCookieConsent(page)).status,'not_found');
  assert.equal(await page.evaluate(()=>window.wrongClick),undefined);
  await page.setContent('<div role="dialog">Cookie preferences<button onclick="this.dataset.clicked=1">Accept all</button></div>');
  assert.equal((await attemptCookieConsent(page)).status,'clicked');
  assert.equal(await page.locator('button').getAttribute('data-clicked'),'1');
  await page.setContent('<div role="dialog">Terms of purchase<button>Accept all</button></div>');
  assert.equal((await attemptCookieConsent(page)).status,'not_found');
  await page.setContent('<iframe srcdoc="<button id=didomi-notice-agree-button onclick=\'this.dataset.clicked=1\'>Accept All</button>"></iframe>');
  await page.frameLocator('iframe').locator('button').waitFor();
  assert.equal((await attemptCookieConsent(page)).status,'clicked');
  assert.equal(await page.frameLocator('iframe').locator('button').getAttribute('data-clicked'),'1');
  await page.setContent('<button id="onetrust-accept-btn-handler" disabled>Accept All Cookies</button>');
  assert.equal((await attemptCookieConsent(page)).status,'not_found');
  await page.setContent('<button id="onetrust-accept-btn-handler">Accept All Cookies</button><div style="position:fixed;inset:0;z-index:10">Overlay blocks clicks</div>');
  assert.equal((await attemptCookieConsent(page)).status,'click_failed');
  // End-to-end fixture: observeConsent waits, clicks the page, then waits again.
  await page.setContent('<button id="onetrust-accept-btn-handler" onclick="window.observedEvent=\'PageView\';this.remove()">Accept All Cookies</button>');
  const start=Date.now();
  const consent=await observeConsent(page,true,()=>{phase='after_consent_attempt'});
  assert.equal(consent.status,'clicked');
  assert.equal(await page.evaluate(()=>window.observedEvent),'PageView');
  assert.ok(Date.now()-start>=10000);
  console.log('Browser consent fixtures passed: known banner, scoped dialog, iframe, hidden/unrelated buttons, two observation windows.');

  const html = await readFile(new URL('../public/index.html',import.meta.url),'utf8');
  for (const width of [1280,390]) {
    const uiPage = await browser.newPage({viewport:{width,height:900}});
    await uiPage.setContent(html);
    await uiPage.selectOption('#mode','source');
    assert.equal(await uiPage.locator('#accept-cookies').isDisabled(),true);
    await uiPage.selectOption('#mode','browser');
    await uiPage.locator('#accept-cookies').check();
    const result={url:'https://example.com',status:200,consent:{requested:true,...consent},note:'Fixture result.',results:analyze('',[], 'browser', [{provider:'Meta',ids:['123'],events:[{pixelId:'123',name:'PageView'}],phase:'after_consent_attempt'}])};
    await uiPage.evaluate(data=>{window.fetch=async (url, options)=>{
      window.sentOptions=JSON.parse(options.body);
      return new Response(JSON.stringify(data),{status:200});
    };},result);
    await uiPage.locator('#url').fill('https://example.com');
    await uiPage.getByRole('button',{name:'Check pixels'}).click();
    await uiPage.locator('#results article').first().waitFor();
    assert.equal(await uiPage.evaluate(()=>window.sentOptions.acceptCookies),true);
    assert.match(await uiPage.locator('#consent-summary').innerText(),/clicked/);
    assert.match(await uiPage.locator('#results article').first().innerText(),/After consent attempt/);
    assert.equal(await uiPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    console.log(`Consent UI passed at ${width}px.`);
    await uiPage.close();
  }
} finally { await browser.close(); }
