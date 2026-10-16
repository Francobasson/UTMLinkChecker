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

This is a local development tool. Before exposing it publicly, add authentication, network-level egress isolation, and resource limits. URL and subrequest checks block private addresses but cannot prevent DNS rebinding without network enforcement. Browser scans execute third-party JavaScript. Only scan sites you are authorized to inspect.

## Deploy to Render

Push these files to GitHub, then create a **Blueprint** in Render and select this repository and branch. Render reads `render.yaml`, builds the Docker image with Chromium and its system dependencies, and exposes the service over HTTPS. Review the selected plan before creating the service. Free instances may sleep and browser scans may exceed their memory limits.

After deployment, open the service's Render URL. Sign in with username `admin` and the generated `BASIC_AUTH_PASSWORD` from the Render service's Environment settings. Do not share that password publicly. The health endpoint is public; the interface and scan API require authentication. Production startup refuses to run without the password. For local authentication checks, set `BASIC_AUTH_PASSWORD` before running `npm start`.

Keep this deployment restricted to trusted users. Basic authentication does not replace network-level egress isolation against DNS rebinding. This deployment is not intended as an anonymous scanning service.
