# Gaps, and how to close them

Nothing here is lost — each item says what SuperX does, why we differ, and the path forward.

| Gap | Why | Path |
|---|---|---|
| 10M+ viral post library | Proprietary dataset. | Daily niche jobs + Discover + extension 💾 grow a private library. Could add scheduled wider crawls (costs X API reads) or import CSVs of public datasets (add `/api/viral/import`). |
| Publish X Articles | No public API. | Editor + export exist. If X ships an endpoint, add to `x.js` and a "Publish" button in `web/pages2.js`. Browser-extension automation of the article editor is possible but fragile and against X ToS risk. |
| Audience demographics / true follower-activity map | Not in X API. | Current proxy: engager timestamps. Alternative: sample followers via `GET /2/users/:id/followers` and infer time zones from profiles (expensive). |
| Article cover as PNG | SVG only. | Render SVG → canvas → PNG in `web/pages2.js` (10 lines). |
| Downloader format conversion (PNG/JPG/WebP, 720p/1080p menu) | API gives variants only. | Convert client-side with canvas; list all `variants` with bitrates instead of picking best. |
| Bio Templates 300+, Post Templates 100+, Banner presets 30+ | Content volume. | Extend arrays in `web/tools2.js`; or bulk-generate with AI and store via `/api/templates`. |
| Reddit username check, alternatives | Not built. | Public Reddit `about.json` fetch + AI alternatives. |
| "Best Tweets" curated collections | Needs curated data. | Seed `viral` table from a curated CSV. |
| Trends pre-cached every 15 min | We fetch on demand. | Add to `cronTick` and store in `kv`. |
| Large media uploads | Inline in D1 (~1.5 MB cap). | Add an R2 binding, upload from the Worker, store keys in `posts.media`. |
| Extension on real x.com | Verified only on a DOM fixture; X changes `data-testid`s. | Load unpacked, spot-check `tweetData()` selectors in `extension/content.js`. |
| Team seats / billing / signup | Single-owner design. | Not planned. |
| Real-time notifications | Polling only. | Cloudflare Queues / Durable Objects if needed. |
