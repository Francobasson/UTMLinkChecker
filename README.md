# Linkwise — UTM Link Checker

A dependency-free Node.js app for social media consultants auditing campaign links before publishing.

## Run

Use Node.js 20 or newer. Run `npm start` from this directory, then open port 3000. Set `PORT` to override it. Run `npm test` for the server smoke and network protection checks.

## Workflow

Paste up to 50 full HTTP(S) URLs, one per line, or try the sample batch. The app checks required UTM fields, empty or duplicate parameters, capitalization, spaces, duplicate links, campaign naming consistency, HTTP errors, redirects, and tracking parameters lost on redirects. Filter or search results and export a CSV audit for clients. Source, medium, campaign, content, term, and campaign ID are shown separately.

Live checks make a GET request without retaining response bodies, follow up to five redirects, and time out per hop. Four links are checked concurrently. Private/local destinations, embedded credentials, and nonstandard ports are blocked; DNS resolution is pinned for each request. URLs are kept in browser memory and are not saved by the app. Checking a link contacts its destination and may register a visit; avoid submitting one-time or sensitive action URLs. Google Fonts is optional; local fallback fonts work offline.

An active destination does not prove analytics is installed or receiving events. Some destinations reject server requests; 403/429 results should be checked manually. Attribution warnings are recommendations, since analytics conventions vary by client. UTM fields should generally use consistent lowercase naming; use distinct `utm_content` values to compare creatives and placements. Avoid tagging internal website navigation, which can distort attribution.

The public checking endpoint uses instance-wide rate and concurrency limits. Add authentication and per-user quotas for larger deployments.

## Deploy to Render

This repository includes a Render Blueprint (`render.yaml`). In Render, select **New → Blueprint**, connect this GitHub repository, choose the branch containing the app, and deploy the blueprint. It creates a free Node web service and provides an HTTPS `onrender.com` URL. No API keys, database, or environment secrets are needed. The free instance may sleep when unused, so the first visit may take longer.

Alternatively choose **New → Web Service**, connect the repository, use `npm test` as the build command and `npm start` as the start command, select the free instance, and set the health check path to `/healthz`. Render sets `PORT` automatically.

The public endpoint has instance-wide limits of 12 simultaneous checks and 240 checks per minute. These protect a small public demo; use an authenticated gateway with per-user quotas for a larger service. Link checks require outbound DNS and HTTPS access from the hosting provider. Deployment is complete only after the Render URL loads and a live link check succeeds there.
