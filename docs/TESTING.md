# Testing

```
npm test            # 17 tests: unit + full-stack e2e against mock X / Anthropic / Bluesky (Node >= 22.13)
npm run dev:mock    # app + mock on http://localhost:8787, password "pw", dummy content, no keys needed
npm run mock        # mock alone on :9000
```

## What the e2e suite covers (`test/e2e.test.js`)
OAuth connect · sync + audience grid · insights · tweet tester ordering · valuation formula invariants · profile/health · live counter · publish now (thread + Bluesky) · cron-scheduled publish · smart queue · automations (plug, retweet, delete dry-run, DM) · signal agent leads + auto-DM + CSV · mentions/inbox/interactions/AI-Shield/reply · engage feed · discover · daily inspiration · trends · timelines · creators · every AI endpoint · media download variants · shadowban heuristic · audit · articles export · templates · plan limits (429) · login rate-limit.

## Manual checks already run
- Chromium click-through of all 14 pages and all 31 tools against the mock, on both the Node server and the real Worker runtime (`wrangler dev --local`, local D1); cron via `/cdn-cgi/handler/scheduled`.
- Extension content script against a fake x.com DOM: badges, save, reply ideas, fact-check, sidebar, live tweet score, profile overlay.
- `wrangler deploy --dry-run` bundles cleanly.

## Not tested
Live X / Anthropic / Bluesky calls; real x.com DOM; loading the extension as an installed Chrome extension.
