# X API notes

Client: `server/x.js`. Base URL is configurable (`X_API_BASE`) so the mock can stand in.

## Auth
OAuth 2.0 Authorization Code + PKCE. Callback `BASE_URL/auth/x/callback`. Scopes:
`tweet.read tweet.write tweet.moderate.write users.read follows.read like.read like.write offline.access dm.read dm.write media.write bookmark.read`.
Access tokens (2 h) refresh automatically and are written back to D1.

## Endpoints used
| Purpose | Endpoint |
|---|---|
| Own profile | `GET /2/users/me` |
| Other profile | `GET /2/users/by/username/:u` |
| Own timeline + metrics | `GET /2/users/:id/tweets` (`public_metrics`, `non_public_metrics`, `organic` fields need own-post context) |
| Other timeline | same, no non-public metrics |
| Mentions | `GET /2/users/:id/mentions` |
| Search (agents, discovery, timelines, shadowban, DM triggers) | `GET /2/tweets/search/recent` |
| Post / thread / reply / delete | `POST /2/tweets`, `DELETE /2/tweets/:id` |
| Repost / like | `POST /2/users/:id/retweets`, `/likes` |
| DM | `POST /2/dm_conversations/with/:id/messages` |
| Media | `POST /2/media/upload` |
| Trends | `GET /2/trends/by/woeid/:woeid` |
| Post + media variants | `GET /2/tweets/:id` with `attachments.media_keys` expansion |

## Things to verify on first live run
1. Your API tier actually allows: search, DMs, trends, non-public metrics, media upload v2. Anything blocked returns a 403 that the UI surfaces.
2. Search query operators: agents use `-is:retweet -is:reply lang:en`. `min_faves` is not supported in v2; like thresholds are filtered client-side.
3. `impression_count` in `public_metrics` availability differs by tier; code falls back to `non_public_metrics`.
4. Rate limits: sync = ~3 timeline calls + 1 mentions + 1 user call per account per hour. Agents/automations run every 15 min and cost search reads. Use Settings → Limits and pause agents to control spend.
5. X pricing is usage-based and changes. Check your dashboard weekly for the first month.

## Mock server
`mock/mock-x.js` implements every endpoint above plus Anthropic `/v1/messages` and Bluesky `createSession/createRecord` with deterministic dummy data (13 users, ~350 posts, mentions, quotes, buying-intent posts). It is a behavioral stand-in, not a spec-exact copy — field shapes were written from the docs.
