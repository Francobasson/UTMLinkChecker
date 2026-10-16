# Pixel Checker

A local web app for detecting Meta, Google Analytics, Google Ads, Google Tag Manager, TikTok, LinkedIn, Pinterest, and Snapchat tracking tags.

## Run

Requires Node.js 20+.

```sh
npm ci
npm start
```

The app listens on loopback port 3000; `PORT` overrides the port. Run `npm test` for detector and URL validation tests.

Page source mode fetches HTML without running JavaScript. Browser mode uses Playwright Chromium: install it with `npx playwright install chromium` (Linux also requires Chromium system dependencies). The browser waits five seconds after DOM readiness without accepting cookies or interacting with the page.

Results distinguish tags from attempted tracking requests. They cannot prove successful event delivery, attribution, or correct account configuration. Consent and delayed tags can cause missing detections. Google Tag Manager is a container. Request evidence omits query strings.

URL and subrequest checks block private addresses but cannot prevent DNS rebinding without network enforcement. Browser scans execute third-party JavaScript. Only scan sites you are authorized to inspect.

## Deploy to Render

Push these files to GitHub, then create a **Blueprint** in Render and select this repository and branch. Render reads `render.yaml`, builds the Docker image with Chromium and its system dependencies, and exposes the service over HTTPS. Review the selected plan before creating the service. Free instances may sleep and browser scans may exceed their memory limits.

After deployment, open the service's Render URL to use the checker directly. No username, password, or authentication environment variable is required. Existing `BASIC_AUTH_PASSWORD` values are ignored and can be removed from Render's Environment settings.
