const knownBanners = [
  ['OneTrust', '#onetrust-accept-btn-handler'],
  ['Cookiebot', '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll'],
  ['Didomi', '#didomi-notice-agree-button'],
  ['CookieYes', '.cky-consent-container .cky-btn-accept'],
];
const acceptLabel = /^(accept all(?: cookies)?|allow all(?: cookies)?|agree to all|alle cookies accepteren|alles accepteren)$/i;

export async function attemptCookieConsent(page, beforeClick = () => {}) {
  // Check the main document and consent iframes, without clicking unrelated
  // accept/purchase/terms buttons or trying to manufacture consent cookies.
  for (const frame of page.frames().slice(0, 20)) {
    const candidates = knownBanners.map(([name, selector]) => [name, frame.locator(selector)]);
    const dialogs = frame.getByRole('dialog').filter({ hasText: /cookies?/i });
    candidates.push(['Cookie dialog', dialogs.getByRole('button', { name: acceptLabel })]);
    for (const [provider, locator] of candidates) {
      for (const button of (await locator.all()).slice(0, 5)) {
        if (!await button.isVisible().catch(() => false)) continue;
        if (!await button.isEnabled().catch(() => false)) continue;
        beforeClick();
        try {
          await button.click({ timeout: 1500 });
          return { status: 'clicked', provider, detail: `${provider}: clicked the accept-all button. The site's consent state is not independently verified.` };
        } catch {
          return { status: 'click_failed', provider, detail: `${provider}: found a button but could not confirm the click. Cookie acceptance is unverified.` };
        }
      }
    }
  }
  return { status: 'not_found', detail: 'No supported, visible accept-all button found. Cookies were not accepted; the site may use an unsupported or delayed banner, or show none in this region.' };
}

export async function observeConsent(page, acceptCookies, onPhase) {
  await page.waitForTimeout(5000);
  if (!acceptCookies) return { requested: false, status: 'not_requested', detail: 'No consent buttons were clicked.' };
  const result = await attemptCookieConsent(page, () => onPhase('after_consent_attempt'));
  if (result.status === 'clicked' || result.status === 'click_failed') await page.waitForTimeout(5000);
  return { requested: true, ...result };
}
