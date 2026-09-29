# Handover: NotSuperX (working name)

Self-hosted clone of superx.so (X/Twitter growth tool) on Cloudflare Workers + D1. Branch `claude/epic-fermi-1g2hdt`.

**Status:** feature-complete against everything we could find about SuperX, except items documented as not buildable (`docs/GAPS.md`).
Tested against a mock X/Anthropic/Bluesky (17 automated tests, Chromium UI click-through, real workerd runtime + local D1, extension against a DOM fixture).
**NOT deployed. NEVER run against live X / Anthropic / Bluesky.**

## Read these
| Doc | Purpose |
|---|---|
| `docs/SUPERX_RESEARCH.md` | Everything captured about SuperX: features, pricing, 38 tools, published formulas (tweet tester, valuation, audit). |
| `docs/FEATURE_MAP.md` | Every SuperX feature → status (built / partly / not buildable) → code location. |
| `docs/GAPS.md` | What differs and how to close each gap. |
| `docs/X_API_NOTES.md` | Endpoints, scopes, what to verify on first live run, cost cautions. |
| `docs/TESTING.md` | How to run tests and the dummy-data environment. |
| `README.md` | Features, deploy, CLI/MCP. |

## Try it in 30 seconds (no keys)
`npm run dev:mock` → http://localhost:8787, password `pw`, Settings → Connect X account (mock OAuth), Analytics → Sync now.

## Architecture
- `server/worker.js` Worker entry (fetch + cron). `server/node.js` local/VPS server (same code). `server/db.js` async adapter over D1; `server/db-node.js` node:sqlite adapter (dev/tests only).
- `server/app.js` core routes + auth; `server/routes2.js` intelligence/inbox/timelines/discovery/articles/templates/limits; `server/core.js` scheduler, sync, analytics, automations, agents, limits, cron dispatch; `server/insights.js` LLM-free analytics (tweet tester, valuation, health score, AI Shield, audience map); `server/x.js`, `ai.js`, `bluesky.js`, `mcp.js`, `md.js`.
- `web/` vanilla-JS SPA, no build step. `extension/` MV3 Chrome extension. `cli/` CLI + MCP stdio bridge. `mock/` mock servers + seed data. `test/` suites. `migrations/` 0001, 0002.
- Cron (every minute): publish due posts; every 15 min automations + signal agents; 06:00 UTC daily inspiration; hourly analytics sync + follower snapshot + audience activity.

## Cloudflare state
- D1 `notsuperx`, id `bf2f67e4-c41a-478e-b683-2587cc0273a7`. Migrations 0001 and 0002 applied. Id is in `wrangler.toml`.
- Worker not deployed; no secrets set. `wrangler deploy --dry-run` bundles cleanly.

## To go live (owner actions)
1. Set `BASE_URL` in `wrangler.toml` to your worker URL.
2. Create X dev app (OAuth 2.0 Web App), callback `BASE_URL/auth/x/callback`; enable read+write and DM scopes.
3. `npx wrangler login`; `wrangler secret put` for `APP_PASSWORD`, `SESSION_SECRET`, `X_CLIENT_ID`, `X_CLIENT_SECRET`, `ANTHROPIC_API_KEY` (opt. `BSKY_HANDLE`, `BSKY_APP_PASSWORD`); `npx wrangler deploy`.
   Or set GitHub secrets `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` and merge to `main` (`.github/workflows/deploy.yml`).
4. Sign in, connect X, create an API key, load `extension/` unpacked (set server URL + key).
5. First week: watch X API usage; use Settings → Limits to cap spend.

## Known risks
- All live-API behavior unverified (tier access, field shapes). See `docs/X_API_NOTES.md`.
- Extension selectors (`data-testid`) unverified on real x.com.
- X API pay-per-use cost may exceed the $50/mo you are saving.
- Single-password auth (rate-limited). Media inline in D1 (~1.5 MB cap).
- Automations only act on posts already synced (latest 300).
