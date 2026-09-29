# SuperX (superx.so) — captured research

Everything learned about the product we are cloning, so nothing is lost. Sources fetched 2026-09-29.
Sources: superx.so (home), superx.so/chrome-extension, superx.so/tools, superx.so/tweet-tester,
superx.so/how-much-is-my-twitter-worth, superx.so/x-profile-audit, superx.so/twitter-counter, Chrome Web Store listing
(chromewebstore.google.com/detail/superx-twitter-analytics/bjobgelaoehgbnklgcaaehdpckmhkplk).

## Positioning
"Complete growth engine for X" — web app + Chrome extension. Made by indie makers Tibo and Rob. ~11,000+ creators, 400K+ posts sent, 5B+ impressions.
Uses the official X API. Extension rated ~4.2–4.4/5, 10,000+ users. Claims all free tools work without signup.

## Pricing (as seen)
| Plan | Price | Includes |
|---|---|---|
| Pro | $49/mo | 5 X accounts, 500 posts/mo, 750 AI credits/mo, 1 Signal Agent (750 leads/day), 1,000 auto DMs/mo |
| Advanced | $49/mo launch (list $99) | Pro + AI Post & Thread Writer, 1,500 AI credits, 3 Signal Agents (3,000 leads/day), 10M+ viral posts library |
| Ultra | $199/mo | 10 accounts, 3,000 posts/mo, 4,000 AI credits (expandable to 100k), 5 Signal Agents (7,500 leads/day), 5,000 auto DMs/mo, priority support |
Also: full API access, CLI and MCP access, Bluesky cross-posting.

## Core product features (home page)
- **Content discovery & creation:** Daily Viral Inspiration (niche-specific), Ready to Post (AI posts in your voice), Trend-Based Inspiration (real-time trend signals), Rewrite with AI (tone-matched).
- **Scheduling & automation:** Smart Scheduler (audience-activity mapping), Auto Retweet, Auto Plug & Auto DM, Auto Delete (low performers).
- **Engagement & growth:** Engagement Growth Engine (strategic engagement feed), Unified Mentions Hub (cross-account), Deep Growth Intelligence (performance breakdown), SuperX Engage (reply suggestions).
- **Content tools:** AI Post & Thread Writer, X Articles publishing, Signal Agents (lead generation), AI article covers.
- **Analytics:** Chrome extension with live performance metrics, audience behavior tracking, engagement-to-follower measurement.

## Chrome extension (store listing + /chrome-extension)
- Sidebar/overlay inside x.com; no tab switching.
- Activity frequency & engagement-rate graphs; best/worst tweets; media vs text comparison (video, photo, links, emojis, hashtags).
- Daily/weekly/monthly follower growth; interaction matrix (likes/replies/retweets between profiles).
- X activity summary (tweets, replies, retweets + KPIs).
- Profile analysis of ANY profile you visit (best tweets + key stats); live performance insights, audience intelligence and engagement signals on any profile/post.
- **AI Shield:** scores likelihood a reply is AI-generated.
- One-click fact-checking of tweets; profile chat with instant summaries; draft rephrase/improve.
- Personalized activity feed / custom timelines from users, lists and keywords; custom search; quick-action shortcuts.
- Tweet scheduling across time zones; Bluesky cross-posting; social discovery hub for networking with creators.
- Reply & quote-tweet tracking inbox.
- Graph-to-visual conversion: shareable posters in 16 styles.
- Themes: dark, dim, light.
- 10M+ viral posts library for hooks/CTAs; AI post & thread writing; content strategy assistance; auto-retweet and auto-delete.

## Free tools (superx.so/tools — 38 listed)
Analytics: X Profile Analytics (engagement, top tweets, personality archetype, estimated earnings) · X Profile Audit (health score: follower ratio, engagement rate, posting consistency) · Best Time to Tweet (heatmap) · Twitter Trends (15-min refresh; worldwide + country pages) · Metrics Calculator (total/avg/median views & engagement) · Account Value Calculator · Shadowban Checker (tests visibility of recent posts in search).
Bio/profile: Bio Generator (8 options) · Bio Templates (300+ by archetype) · Bio Guide · Username Availability (X and Reddit, alternatives).
Content: Tweet Tester (preview + score) · Doomscroll Filter (Read/Pass/Not Sure by niche) · Twitter Roast (scores last 40 posts) · Character Counter (280 and 25,000) · Fonts Generator (12 Unicode styles) · LinkedIn Text Formatter · Tweet Deleter Guide · X Roadmap Generator · Best Tweets Collections.
AI writing: Tweet Generator (3 tweets, short/med/long) · Thread Generator (hook-first) · Text · Paragraph · Content · AI Writer · Story generators.
Design: Banner Maker (1500x500, 30+ archetype templates, no watermark) · Blank Tweet Template · Post Templates (100+) · Tweet-to-Image (PNG, light/dark, up to 4x) · Fake Tweet Maker / Generator.
Downloaders: Video (720p/1080p/best) · GIF (as MP4) · Photo (PNG/JPG/WebP/original) · Video Tools hub.
Live: Follower Counter (15-second updates).

## Published methodologies (reproduced in this repo)
**Tweet Tester** — score 0–100 as a *comparison to your own typical post* (70 = substantially stronger, 40 = weaker). Predicts likes, replies, reposts (reposts low confidence). Helps: original results/firsthand proof, clear opening lines, actionable questions, media. Hurts: explicit engagement asks ("ask me anything"), external links, machine-sounding phrasing. Limitation: ignores timing, audience, competing feed content.
**Account Value** — baseline $20 CPM on average views of up to 100 recent original posts; engagement-rate multiplier vs a 2% baseline, clamped 0.5x–2x; estimated sponsored-post price × 4 posts/month × 24 months = account value. Disclaimer: X accounts can't be officially sold.
**Profile Audit** — score /100 from follower ratio, engagement rate, posting patterns (consistency over volume), content quality, profile optimization; >70 solid, 50–70 opportunities, <50 significant issues; category breakdown, recommendations, benchmarking.
