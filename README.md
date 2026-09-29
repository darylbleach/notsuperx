# NotSuperX

Self-hosted X (Twitter) growth suite on Cloudflare Workers + D1. Zero runtime dependencies.

## Features
| Area | What |
|---|---|
| Scheduler | Compose, drafts, calendar, auto-thread split, media, smart queue (custom slots or best-performing hours), Bluesky cross-post |
| Analytics | Impressions/engagement/followers, post-type breakdown, best-time heatmap, follower snapshots, CSV export |
| AI | Posts, threads, rewrite, trend posts, ready-to-post from your viral library, reply ideas, X Article + SVG cover, chat, voice profile |
| Inspiration | Viral library (discover via X search, manual add, Chrome-extension save), trends |
| Engage | Target-account reply-opportunity feed, AI reply suggestions, unified mentions across accounts |
| Automations | Auto retweet, auto plug, auto DM, auto delete (dry-run) — cron every 15 min |
| Signal agents | Saved X searches → leads, follower filter, AI-personalized auto DM, CSV |
| Free tools | Char counter, thread splitter, tweet→image, fake tweet, banner, LinkedIn formatter, templates, engagement calc, valuation, bio/roadmap AI, profile audit, username/follower lookup, shadowban heuristic, media downloader, bulk deleter, optimal time |
| Access | Web app, Chrome extension (`extension/`), REST API (Bearer key), CLI (`cli/notsuperx.js`), MCP server (`POST /mcp`) |

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
`cp .env.example .env && npm start` (Node ≥ 22.13, uses `node:sqlite`). `npm test` runs the suite.

## Chrome extension
`chrome://extensions` → Developer mode → Load unpacked → `extension/`. Set server URL + API key in options.

## CLI / MCP
```
export NSX_URL=https://your.worker.dev NSX_KEY=nsx_...
node cli/notsuperx.js post "hello" --queue
node cli/notsuperx.js mcp      # prints MCP client config
```

## Honest limits
- X API is paid per usage; that cost is yours. Heavy sync/search/agents can exceed $50/mo.
- No 10M-post library ships with this; you build your own (Discover, extension, manual).
- X has no public API for publishing X Articles or reading audience demographics; Article writer outputs copy-ready markdown.
- Best-time and shadowban features are heuristics from your own data / search visibility.
