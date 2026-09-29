# Feature map: SuperX → NotSuperX

Legend: ✅ built and tested · 🟡 built with a stated difference · 📄 not buildable / not built — reason and path documented · ⛔ out of scope by design.
"Tested" = automated test against the mock X/AI/Bluesky (`npm test`, 17 tests), UI click-through in Chromium (14 pages, 31 tools), and the Worker run on the real workerd runtime with local D1. **Nothing has run against the live X API yet** (see `docs/X_API_NOTES.md`).
Source of the SuperX side: `docs/SUPERX_RESEARCH.md`.

## Home-page features
| SuperX feature | Status | Where | Notes |
|---|---|---|---|
| Daily Viral Inspiration (niche) | ✅ | `core.dailyInspiration`, Inspiration page, cron 06:00 UTC | You define niches (name / X query / min likes). Your own data, not a shared library. |
| Ready to Post (AI, your voice) | ✅ | `ai.readyToPost`, `/api/ai/ready`, AI Writer | Uses hook structure of your saved viral posts + voice profile. |
| Trend-based inspiration | ✅ | `/api/trends`, Twitter trends tool, `ai.fromTrend` | Needs X trends endpoint on your API tier. |
| Rewrite with AI (tone) | ✅ | `ai.rewrite`, AI Writer, extension | |
| Smart Scheduler | 🟡 | `core.nextSlot`, `core.bestTimes`, Scheduler page | Slots = your custom times or blend of own per-hour performance (60%) + engager activity (40%). "Audience activity" is derived from mention/reply timestamps, because X exposes no follower-wide activity data. |
| Timezone scheduling | ✅ | Compose (IANA zone picker, `zonedToUnix`) | |
| Auto Retweet | ✅ | `core.runAutomations` | Re-surfaces own post after N hours if ≥ min likes. |
| Auto Plug | ✅ | same | Replies with your CTA once a like threshold is hit. |
| Auto DM | ✅ | same | DMs people who replied (optional keyword). |
| Auto Delete | ✅ | same | Dry-run by default. Only touches posts already synced. |
| Engagement Growth Engine | 🟡 | Engage page, `/api/engage/feed` | Target-account feed ranked by reply opportunity (likes/age, few replies), AI reply drafts, reply+like. No daily quota tracker. |
| Unified Mentions Hub | ✅ | Engage page, `/api/mentions` | All connected accounts in one list. |
| Reply & quote tracking inbox | ✅ | Inbox page, `/api/inbox` | Filter replies / quotes / mentions, mark handled, AI draft, AI-Shield badge. |
| Deep Growth Intelligence | ✅ | Insights page, `/api/insights` | With/without comparison (media, link, emoji, hashtag, question, length), frequency vs performance, best/worst posts, followers per 1k impressions, audience heatmap. |
| SuperX Engage (reply suggestions) | ✅ | `ai.replies`, Engage, Inbox, extension ✨ | |
| AI Post & Thread Writer | ✅ | AI Writer, `ai.posts/thread` | Threads auto-split at publish too. |
| X Articles publishing | 🟡📄 | Articles page, `/api/articles`, exports .md/.html | Editor + AI draft + AI cover + export. **X has no public API to publish Articles** — paste into X's editor manually. Revisit if X ships one (`docs/GAPS.md`). |
| AI article covers | 🟡 | `ai.articleCover` | Generates SVG art (copy/embed). No raster PNG export yet. |
| Signal Agents (lead gen) | ✅ | Signal Agents page, `core.runAgents` | Saved X searches → leads, follower filter, AI-personalized DM, CSV. Runs every 15 min. Volume limited by your X API plan. |
| Chrome extension, live metrics | ✅ | `extension/` | Sidebar (Alt+N), per-post ER badge, save-to-library, reply ideas, fact-check, tweet-tester live score. Verified against a DOM fixture, not real x.com. |
| Audience behavior tracking | 🟡 | `insights.recordAudience` | See Smart Scheduler note. No demographics (X API doesn't provide them). |
| Engagement-to-follower measurement | ✅ | Analytics "Followers / 1k imp." | Follower snapshots taken on every sync. |
| Multi-account (5 / 10) | ✅ | Account switcher, Settings | Limit configurable. |
| Bluesky cross-posting | ✅ | `bluesky.js`, Compose toggle | 300-char truncation; link facets. |
| API access | ✅ | `/api/*` with Bearer key | Settings → API keys. |
| CLI | ✅ | `cli/notsuperx.js` | post / queue / analytics / ai / sync. |
| MCP | ✅ | `POST /mcp`, `cli/mcp-stdio.js` | 12 tools; HTTP and stdio bridge. |
| 10M+ viral posts library | 📄 | — | Proprietary dataset; cannot be copied. Grow your own (Discover, daily niches, extension 💾). See `docs/GAPS.md`. |
| Plans, AI credits, quotas | 🟡 | Settings → Limits, `core.enforce` | Optional guardrails with presets matching SuperX Pro/Advanced/Ultra numbers. Default unlimited. |
| Billing, signup, teams, priority support | ⛔ | — | Single-owner self-hosted app. |

## Chrome extension feature list
| Feature | Status | Notes |
|---|---|---|
| Sidebar on x.com | ✅ | Alt+N or ✕ button. |
| Activity / engagement-rate graphs, best & worst tweets | ✅ web | In web Analytics/Insights; extension sidebar shows 7-day summary. |
| Media vs text comparison (video/photo/links/emoji/hashtags) | ✅ web | Insights. |
| Follower growth daily/weekly/monthly | ✅ web | Analytics (7/30/90/365 days). |
| Interaction matrix | 🟡 | Insights + extension button. Built from mentions/replies/quotes only. |
| Profile analysis of any profile | ✅ | Overlay on any `x.com/<user>` page + Profile analytics tool. |
| AI Shield | ✅ | Local heuristic badge on replies; server heuristic + optional LLM second opinion. |
| Fact-check | ✅ | 🔍 button; `ai.factCheck`. Model can't verify recent events; says so. |
| Profile chat | ✅ | In overlay and tool. |
| Draft rephrase | ✅ | ✨ Rewrite in sidebar. |
| Custom timelines (users/lists/keywords) | ✅ web | Timelines page (X lists API not used; use account lists). |
| Custom search | 🟡 | Timelines accept any X search query. |
| Quick-action shortcuts | 🟡 | Alt+N; per-post buttons. |
| Social discovery hub | ✅ web | Inspiration → Find creators, "+ Engage". |
| Graph → poster (16 styles) | 🟡 | Free tools → Graph → poster: 16 palette styles, 3 metrics. Not pixel-identical designs. |
| Themes dark/dim/light | ✅ | Web Settings and extension sidebar. |

## Free tools (SuperX lists 38)
| # | Tool | Status | Notes |
|---|---|---|---|
| 1 | X Profile Analytics | ✅ | Archetype, health, valuation, top posts, earnings estimate. |
| 2 | X Profile Audit | ✅ | Score /100 with category breakdown + recommendations (rules in `insights.healthScore`). |
| 3 | Best Time to Tweet | ✅ | Dashboard heatmap + Optimal post time tool. |
| 4 | Twitter Trends | 🟡 | 12 countries via WOEID; fetched on demand (SuperX pre-caches every 15 min). |
| 5 | Metrics Calculator | ✅ | Total/avg/median views & engagement for any public profile. |
| 6 | Account Value Calculator | ✅ | SuperX's published formula (`insights.valuation`), steps shown. |
| 7 | Shadowban Checker | 🟡 | Search-visibility heuristic only. |
| 8 | Bio Generator | ✅ | 8 options. |
| 9 | Bio Templates (300+) | 🟡 | 10 archetypes × 2 placeholders; use Bio Generator for volume. Extend `BIOS` in `web/tools2.js`. |
| 10 | Bio Guide | 📄 | Editorial content page, not a tool. |
| 11 | Username Availability (X + Reddit) | 🟡 | X only via API lookup; no Reddit, no alternatives. |
| 12 | Tweet Tester | ✅ | Score vs own baseline, predicted likes/replies/reposts, helps/hurts, feed preview. |
| 13 | Doomscroll Filter | ✅ | Read / Pass / Not Sure by niche (AI). |
| 14 | Twitter Roast | ✅ | AI. |
| 15 | Character Counter | ✅ | 280 and 25,000 modes; URL = 23. |
| 16 | Fonts Generator (12) | ✅ | |
| 17 | LinkedIn Formatter | ✅ | Bold/italic/underline/strikethrough. |
| 18 | Tweet Deleter | 🟡 | Bulk delete of synced posts by age/likes, with preview. Doesn't reach unsynced history. |
| 19 | X Roadmap Generator | ✅ | AI. |
| 20 | Best Tweets Collections | 🟡 | Ranks your own viral library, not curated famous accounts. |
| 21–27 | AI Tweet/Thread/Text/Paragraph/Content/Writer/Story | ✅ | AI writers + AI Writer page. |
| 28 | Banner Maker | 🟡 | 12 archetype presets (SuperX: 30+). Add to `BANNERS`. |
| 29 | Blank Tweet Template | ✅ | Light/dark. |
| 30 | Post Templates (100+) | 🟡 | 27 built-in in 9 categories + unlimited custom saved templates. |
| 31 | Tweet to Image | ✅ | 1x–4x PNG, light/dark. |
| 32–33 | Fake Tweet Maker / Generator | ✅ | Editable name/handle/text/likes. |
| 34–37 | Video / GIF / Photo downloaders + hub | 🟡 | Best-bitrate MP4 via API `variants`; photo original URL. No PNG/JPG/WebP conversion, no quality menu. |
| 38 | Live Follower Counter | ✅ | 15 s polling (costs API reads: mind your quota). |

## Cross-cutting
| Item | Status |
|---|---|
| Auth | Single password, signed cookie, login rate-limit (8 / 15 min). |
| Media upload | Inline base64 in D1, capped ~1.5 MB per file. Larger → move to R2 (`docs/GAPS.md`). |
| Analytics sync | Latest 300 posts (3 pages), hourly + on demand. |
| Hosting | Cloudflare Worker + D1 + Cron. D1 created and migrated. **Worker not deployed** (needs your credentials). |
