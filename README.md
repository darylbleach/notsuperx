# NotSuperX

Self-hosted X (Twitter) growth suite on Cloudflare Workers + D1. Zero runtime dependencies.

## Features
See **`docs/FEATURE_MAP.md`** for the full SuperX → NotSuperX mapping with status of every feature (built / partly built / not buildable and why).

Highlights: smart scheduler with time zones and Bluesky · analytics + growth intelligence · AI writer/threads/rewrite/replies/articles in your voice · viral library with daily niche discovery · engage feed, inbox (replies/quotes), unified mentions, AI Shield · auto retweet/plug/DM/delete · signal agents · custom timelines · creator discovery · tweet tester, profile analytics/audit/valuation for any profile · 31 free tools · Chrome extension · REST + CLI + MCP · optional plan limits.

Docs: `docs/SUPERX_RESEARCH.md` (what SuperX offers) · `docs/FEATURE_MAP.md` · `docs/GAPS.md` · `docs/X_API_NOTES.md` · `docs/TESTING.md` · `HANDOVER.md`.

Try it now with dummy data and no keys: `npm run dev:mock` → http://localhost:8787 (password `pw`).

## Deploy (Cloudflare)
1. D1 database `notsuperx` is created and migrated; its id is in `wrangler.toml`.
2. Set `BASE_URL` in `wrangler.toml` to your worker URL.
3. Create an X app at developer.x.com (OAuth 2.0, Web App). Callback: `BASE_URL/auth/x/callback`.
4. Secrets:
   ```
   npx wrangler login
   for s in APP_PASSWORD SESSION_SECRET X_CLIENT_ID X_CLIENT_SECRET ANTHROPIC_API_KEY; do npx wrangler secret put $s; done
   # optional: BSKY_HANDLE BSKY_APP_PASSWORD
   npx wrangler deploy
   ```
   Or push to `main` with repo secrets `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` (workflow included).
5. Open the URL, sign in, Settings → Connect X account.

## Local
`cp .env.example .env && npm start` (Node ≥ 22.13, uses `node:sqlite`). `npm test` runs the suite; `npm run dev:mock` runs everything against dummy X data.

## Chrome extension
`chrome://extensions` → Developer mode → Load unpacked → `extension/`. Set server URL + API key in options.

## CLI / MCP
```
export NSX_URL=https://your.worker.dev NSX_KEY=nsx_...
node cli/notsuperx.js post "hello" --queue
node cli/notsuperx.js mcp      # prints MCP client config
```

## Honest limits
See `docs/GAPS.md`. Short version: X API is pay-per-use (your cost); no 10M-post dataset; X Articles can't be published via API; audience demographics aren't available; nothing has yet run against live X.
