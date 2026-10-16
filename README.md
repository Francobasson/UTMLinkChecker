# Pixel Checker

A local web app for detecting Meta, Google Analytics, Google Ads, Google Tag Manager, TikTok, LinkedIn, Pinterest, and Snapchat tracking tags.

## Run

Requires Node.js 20+.

```sh
npm ci
npm start
```

The app listens on loopback port 3000; `PORT` overrides the port. Run `npm test` for detector and URL validation tests.

Page source mode fetches HTML without running JavaScript. Browser mode uses Playwright Chromium: install it with `npx playwright install chromium` (Linux also requires Chromium system dependencies). The browser waits five seconds after DOM readiness. Cookie acceptance is optional and disabled by default.

## Cookie consent

In **Browser visit**, enable **Attempt to accept all cookies** to scan before and after a cookie-banner interaction. Each scan uses a fresh browser context. After the initial five-second observation, the checker looks for visible OneTrust, Cookiebot, Didomi, and CookieYes accept-all controls, or exact English/Dutch accept-all labels inside a cookie-related dialog, including frames. It does not click arbitrary accept buttons or set artificial consent cookies.

Results report **clicked**, **not found**, or **click failed**. A click is not proof that the site recorded consent. After a click attempt, the browser observes five more seconds and labels events by timing: **Before consent** or **After consent attempt**. Duplicate checks group within each phase so a PageView before and after consent does not itself trigger a duplicate warning. This is a same-session observation, not an isolated A/B test or consent-compliance audit. Region, language, custom banners, delays, or bot detection may require manual testing. Cookie acceptance cannot be used in source-only mode.

Run `npm run test:browser` after installing Chromium for consent and desktop/mobile UI fixture checks. Set `BROWSER_EXECUTABLE_PATH` to use a system Chromium for these tests.

Results distinguish tags from attempted tracking requests. They cannot prove successful event delivery, attribution, or correct account configuration. Consent and delayed tags can cause missing detections. Google Tag Manager is a container. Request evidence omits query strings.

## Campaign diagnostics

Results show readable pixel/tag IDs, observed event names and request counts, and possible duplicate events grouped by provider, ID, and event name during a single visit. Repeated requests are warnings to investigate, not proof of double counting; retries and legitimate repeat actions can cause them. IDs from static configuration do not prove account ownership.

Each check reports **Passed**, **Needs attention**, or **Not tested**. Passed applies only to the stated observation, not overall campaign readiness. Page source mode cannot test firing or duplicates. Unknown event formats and missing IDs remain untested. Apart from the optional cookie-consent interaction, the checker takes no actions beyond the initial visit, so purchase/lead journeys and consent compliance require separate testing. Confirm event receipt and account ownership in the provider's Events Manager.

Browser diagnostics parse supported query, form, and selected JSON payload formats. Raw bodies and query strings are not returned; only IDs and event names are retained for diagnostics. Unrecognized formats can leave names or IDs unavailable. Browser observations are capped at 2,000 requests per visit.

URL and subrequest checks block private addresses but cannot prevent DNS rebinding without network enforcement. Browser scans execute third-party JavaScript. Only scan sites you are authorized to inspect.

## Deploy to Render

Push these files to GitHub, then create a **Blueprint** in Render and select this repository and branch. Render reads `render.yaml`, builds the Docker image with Chromium and its system dependencies, and exposes the service over HTTPS. Review the selected plan before creating the service. Free instances may sleep and browser scans may exceed their memory limits.

After deployment, open the service's Render URL to use the checker directly. No username, password, or authentication environment variable is required. Existing `BASIC_AUTH_PASSWORD` values are ignored and can be removed from Render's Environment settings.
