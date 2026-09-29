# Handover: NotSuperX (working name)

Self-hosted clone of superx.so (X/Twitter growth tool). Branch `claude/epic-fermi-1g2hdt`.
Status: **built, tested locally, NOT deployed, NEVER run against live X / Anthropic / Bluesky.**

## Architecture
- `server/worker.js` Cloudflare Worker entry (fetch + cron). `server/node.js` local/VPS server (same code).
- `server/app.js` all REST routes + auth (cookie session or Bearer API key). `server/core.js` scheduler, sync, analytics, automations, agents, `cronTick`.
- `server/x.js` X API v2 client (OAuth2 PKCE, token refresh). `server/ai.js` Anthropic calls. `server/bluesky.js`. `server/mcp.js` MCP over HTTP (`POST /mcp`).
- `server/db.js` async adapter over D1 / `node:sqlite`. Schema: `migrations/0001_init.sql`.
- `web/` vanilla-JS SPA (no build step). `extension/` MV3 Chrome extension. `cli/notsuperx.js`. `test/` (7 tests, `npm test`).
- Cron: every minute publishes due posts; every 15 min automations + agents; hourly analytics sync + follower snapshot.

## Cloudflare state
- D1 `notsuperx`, id `bf2f67e4-c41a-478e-b683-2587cc0273a7`, schema applied. Id already in `wrangler.toml`.
- Worker NOT deployed. No secrets set.

## To go live (owner actions)
1. Set `BASE_URL` in `wrangler.toml`.
2. Create X dev app (OAuth 2.0 Web App), callback `BASE_URL/auth/x/callback`. Enable read+write, DM scopes.
3. `npx wrangler login`, then `wrangler secret put` for: `APP_PASSWORD`, `SESSION_SECRET`, `X_CLIENT_ID`, `X_CLIENT_SECRET`, `ANTHROPIC_API_KEY` (opt: `BSKY_HANDLE`, `BSKY_APP_PASSWORD`). Then `npx wrangler deploy`.
   Or add GitHub secrets `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` and merge to `main` (workflow `.github/workflows/deploy.yml`).
4. Sign in, Settings -> Connect X, create API key, load `extension/` unpacked, set server URL + key.

## Known risks / untested
- All X calls unverified live. Endpoint/scope/tier access (media upload, DMs, trends, `non_public_metrics`, search) depends on your X API plan; expect fixes on first real run.
- Extension DOM selectors (`data-testid`) unverified in Chrome; X changes them often.
- X API is pay-per-use: cost can exceed $50/mo. Watch usage.
- Session cookie is HMAC-signed, single password, no rate limiting on login. Add before exposing widely.
- Media uploaded inline as base64 in D1 (row size limit ~1-2MB). Use R2 for big media.
- Metrics sync only pulls latest 100 posts.
- Automations act only on posts already synced into `metrics`.
- Quotas/credits/plan limits from SuperX are not enforced.

## Not built / partial vs SuperX
See README "Honest limits" and chat summary: no daily auto-curated viral feed, no true audience-activity mapping, no X Article publishing (no API), no live per-tweet/profile overlay on arbitrary profiles in extension, no 10M-post library, MCP is HTTP only (no stdio), no team/billing.
