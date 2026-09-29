// Analytics/intelligence that needs no LLM: tweet tester, valuation, health score, AI-shield, audience map, comparisons.
import { kvGet, kvSet } from './db.js';
import { classify } from './x.js';

const now = () => Math.floor(Date.now() / 1000);
export const eng = (m) => (m.likes ?? m.like_count ?? 0) + (m.replies ?? m.reply_count ?? 0) + (m.reposts ?? m.retweet_count ?? 0) + (m.quotes ?? m.quote_count ?? 0) + (m.bookmarks ?? m.bookmark_count ?? 0);
const median = (a) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y), i = s.length >> 1; return s.length % 2 ? s[i] : (s[i - 1] + s[i]) / 2; };
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const EMOJI = /\p{Extended_Pictographic}/u;

export function textFeatures(text, { hasMedia = false } = {}) {
  const first = text.split('\n')[0] || '';
  return {
    len: text.length, lines: text.split('\n').length, hasLink: /https?:\/\//.test(text), hasEmoji: EMOJI.test(text), hasHashtag: /(^|\s)#\w+/.test(text),
    hasQuestion: /\?/.test(text), hasNumber: /\d/.test(first + ' ' + text.slice(0, 200)), hasMedia,
    shortHook: first.length > 0 && first.length <= 80, firstPerson: /\b(I|my|we|our)\b/.test(text.slice(0, 120)),
    bait: /(ask me anything|\bAMA\b|like (if|and)|RT if|retweet if|follow for|comment below|tag someone|drop a)/i.test(text),
    robotic: /(delve|in today's fast-paced|game-?changer|unlock the|tapestry|it's important to note|in the realm of|elevate your|leverage the power)/i.test(text),
  };
}

/** Tweet tester: 0–100, 50 = your typical post. Blends heuristics from public guidance with your own historical lifts. */
export async function tweetTest(db, accountId, text, opts = {}) {
  const rows = await db.all("SELECT text,type,likes,replies,reposts,quotes,bookmarks FROM metrics WHERE account_id=? AND type!='reply'", accountId);
  const base = { likes: median(rows.map((r) => r.likes)), replies: median(rows.map((r) => r.replies)), reposts: median(rows.map((r) => r.reposts)) };
  const f = textFeatures(text, opts);
  const helps = [], hurts = []; let s = 50;
  const add = (cond, pts, msg) => { if (cond) { s += pts; (pts > 0 ? helps : hurts).push(msg); } };
  add(f.shortHook, 6, 'Clear, short opening line'); add(f.hasNumber, 5, 'Concrete numbers / firsthand proof');
  add(f.firstPerson, 4, 'First-person, lived experience'); add(f.hasQuestion && !f.bait, 4, 'Actionable question');
  add(f.hasMedia, 8, 'Media attached'); add(f.lines >= 3 && f.len < 260, 3, 'Scannable line breaks');
  add(f.bait, -12, 'Engagement bait / explicit ask'); add(f.hasLink, -10, 'External link (audience leaves X)');
  add(f.robotic, -10, 'Phrasing that reads machine-written'); add(f.hasHashtag, -4, 'Hashtags');
  add(f.len > 280, -3, 'Over 280 chars (will be threaded/collapsed)'); add(f.len < 30, -6, 'Very thin content');
  // Personal lift: compare your historical average engagement for posts with the same traits.
  const withF = (pred) => rows.filter((r) => pred(textFeatures(r.text, { hasMedia: r.type === 'media' })));
  const lift = (name, pred, has) => { if (!has) return; const a = withF(pred); if (a.length < 5) return; const b = rows.filter((r) => !a.includes(r)); const ma = mean(a.map(eng)), mb = mean(b.map(eng)) || 1; const d = Math.max(-8, Math.min(8, Math.round((ma / mb - 1) * 10))); if (d) { s += d; (d > 0 ? helps : hurts).push(`Your history: posts with ${name} average ${Math.round((ma / mb - 1) * 100)}% ${d > 0 ? 'more' : 'less'} engagement`); } };
  lift('links', (x) => x.hasLink, f.hasLink); lift('questions', (x) => x.hasQuestion, f.hasQuestion); lift('numbers', (x) => x.hasNumber, f.hasNumber); lift('emoji', (x) => x.hasEmoji, f.hasEmoji);
  s = Math.max(0, Math.min(100, Math.round(s)));
  const mult = Math.pow(1.03, s - 50);
  return { score: s, verdict: s >= 70 ? 'Much stronger than your usual post' : s >= 55 ? 'Better than usual' : s >= 45 ? 'About your usual' : 'Weaker than usual',
    predicted: { likes: Math.round(base.likes * mult), replies: Math.round(base.replies * mult), reposts: Math.round(base.reposts * mult), repostsConfidence: 'low' },
    baseline: base, features: f, helps, hurts, note: 'A comparison against your own baseline, not a forecast. Ignores timing and audience.' };
}

/** Account valuation per superx.so's published method: $20 CPM x engagement multiplier (0.5–2x vs 2% baseline) x 4 posts/mo x 24 months. */
export function valuation(posts) {
  const orig = posts.filter((p) => !(p.referenced_tweets || []).some((r) => r.type === 'replied_to')).slice(0, 100);
  const views = orig.map((p) => p.public_metrics?.impression_count || 0);
  const avgViews = mean(views), totalViews = views.reduce((a, b) => a + b, 0);
  const totalEng = orig.reduce((a, p) => a + eng(p.public_metrics || {}), 0);
  const er = totalViews ? totalEng / totalViews : 0;
  const multiplier = Math.max(0.5, Math.min(2, er / 0.02 || 0.5));
  const cpm = 20, pricePerPost = Math.round((avgViews / 1000) * cpm * multiplier);
  return { postsAnalyzed: orig.length, avgViews: Math.round(avgViews), engagementRate: +(er * 100).toFixed(2), baselineER: 2, cpm, multiplier: +multiplier.toFixed(2),
    sponsoredPostPrice: pricePerPost, postsPerMonth: 4, months: 24, accountValue: Math.round(pricePerPost * 4 * 24),
    formula: 'price = avgViews/1000 × $20 × clamp(ER/2%, 0.5, 2); value = price × 4 posts × 24 months',
    disclaimer: 'Estimate for sponsorship conversations. X accounts cannot officially be sold.' };
}

export function metricsSummary(posts) {
  const v = posts.map((p) => p.public_metrics?.impression_count || 0), e = posts.map((p) => eng(p.public_metrics || {}));
  const sum = (a) => a.reduce((x, y) => x + y, 0);
  return { posts: posts.length, views: { total: sum(v), average: Math.round(mean(v)), median: Math.round(median(v)) }, engagement: { total: sum(e), average: +mean(e).toFixed(1), median: median(e) } };
}

export function archetype(posts) {
  const n = posts.length || 1; const t = (fn) => posts.filter(fn).length / n;
  const replies = t((p) => classify(p) === 'reply'), links = t((p) => classify(p) === 'link'), media = t((p) => classify(p) === 'media'), q = t((p) => /\?/.test(p.text));
  const long = t((p) => p.text.length > 200);
  const scores = { Conversationalist: replies * 2, Marketer: links * 2, 'Visual Creator': media * 2, Curious: q * 1.5, Educator: long * 1.5, 'Hot-taker': t((p) => /(unpopular|hot take|wrong|stop )/i.test(p.text)) * 3 };
  return Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0];
}

/** Health score 0–100: follower ratio 20, engagement 30, consistency 20, content mix 15, profile 15. */
export function healthScore(user, posts) {
  const pm = user.public_metrics || {}; const cats = []; const recs = [];
  const ratio = pm.following_count ? pm.followers_count / pm.following_count : pm.followers_count;
  const r1 = Math.min(20, Math.round(Math.log10(1 + ratio) * 10)); cats.push(['Follower ratio', r1, 20]);
  if (ratio < 1.5) recs.push('Follow fewer accounts than follow you; aim for a ratio above 2.');
  const v = posts.reduce((a, p) => a + (p.public_metrics?.impression_count || 0), 0), e = posts.reduce((a, p) => a + eng(p.public_metrics || {}), 0);
  const er = v ? e / v : 0; const r2 = Math.min(30, Math.round((er / 0.03) * 30)); cats.push(['Engagement rate ' + (er * 100).toFixed(2) + '%', r2, 30]);
  if (er < 0.02) recs.push('Engagement rate under 2%: lead with a stronger hook, ask fewer generic questions, add specifics.');
  const times = posts.map((p) => Date.parse(p.created_at)).sort((a, b) => a - b); const gaps = times.slice(1).map((t, i) => (t - times[i]) / 864e5);
  const gm = mean(gaps), gsd = Math.sqrt(mean(gaps.map((g) => (g - gm) ** 2))); const cv = gm ? gsd / gm : 2;
  const r3 = posts.length < 5 ? 3 : Math.max(0, Math.round(20 - cv * 8)); cats.push(['Posting consistency', r3, 20]);
  if (r3 < 12) recs.push('Posting is bursty. Schedule a steady cadence (queue slots).');
  const types = new Set(posts.map(classify)); const r4 = Math.min(15, types.size * 4); cats.push(['Content mix', r4, 15]);
  if (types.size < 3) recs.push('Mix formats: text, media, and the occasional link/thread.');
  const r5 = (user.description?.length > 40 ? 8 : user.description ? 4 : 0) + (user.profile_image_url && !/default_profile/.test(user.profile_image_url) ? 4 : 0) + (user.name ? 3 : 0); cats.push(['Profile completeness', r5, 15]);
  if (!user.description || user.description.length < 40) recs.push('Bio is thin: say who you help and the outcome.');
  const score = cats.reduce((a, c) => a + c[1], 0);
  return { score, band: score > 70 ? 'Solid' : score >= 50 ? 'Room to improve' : 'Needs attention', categories: cats.map(([name, pts, max]) => ({ name, pts, max })), recommendations: recs };
}

/** Heuristic "AI-generated reply" detector (0–100 likelihood). */
export function aiShield(text, { author } = {}) {
  const reasons = []; let s = 10; const add = (c, p, r) => { if (c) { s += p; reasons.push(r); } };
  add(/(great|excellent|fantastic|insightful|valuable|amazing) (post|thread|insight|point|take|read)/i.test(text), 25, 'Generic praise opener');
  add(/(thanks for sharing|thank you for sharing|love this|this resonates|so true)/i.test(text), 15, 'Stock engagement phrase');
  add(/(delve|tapestry|game-?changer|it's important to note|unlock|leverage|navigate the|in today's)/i.test(text), 20, 'Machine-typical vocabulary');
  add(/—/.test(text), 10, 'Em-dash');
  add(/^(as an ai|i'?m an ai)/i.test(text), 60, 'Self-identifies as AI');
  add(/\b(\w+), (\w+),? and (\w+)\b/.test(text) && text.length > 90, 8, 'Tidy triplet structure');
  add(/#\w+/.test(text), 8, 'Hashtag in a reply');
  add(text.length > 200, 8, 'Unusually long/formal for a reply');
  add(/[!]{1}\s*$/.test(text) && /[\u{1F300}-\u{1FAFF}]\s*$/u.test(text), 8, 'Ends with emoji + exclamation');
  add(!/\d|@\w+|https?:/.test(text) && text.length > 60, 6, 'No specifics (numbers, names, links)');
  s = Math.min(99, s);
  return { score: s, label: s >= 60 ? 'Likely AI' : s >= 35 ? 'Possibly AI' : 'Likely human', reasons };
}

export function contentComparison(rows) {
  const grp = (name, pred) => { const a = rows.filter(pred), b = rows.filter((r) => !pred(r)); const f = (x) => ({ posts: x.length, avgImpressions: Math.round(mean(x.map((r) => r.impressions))), avgEngagement: +mean(x.map(eng)).toFixed(1) });
    return { trait: name, with: f(a), without: f(b), liftPct: b.length && mean(b.map(eng)) ? Math.round((mean(a.map(eng)) / mean(b.map(eng)) - 1) * 100) : null }; };
  return [grp('media', (r) => r.type === 'media'), grp('link', (r) => r.type === 'link' || /https?:\/\//.test(r.text || '')), grp('emoji', (r) => EMOJI.test(r.text || '')), grp('hashtag', (r) => /(^|\s)#\w+/.test(r.text || '')), grp('question', (r) => /\?/.test(r.text || '')), grp('thread-length (>200 chars)', (r) => (r.text || '').length > 200)].filter((g) => g.with.posts && g.without.posts);
}

export function frequencyReport(rows) {
  const byDay = {}; for (const r of rows) { const d = new Date(r.created_at * 1000).toISOString().slice(0, 10); (byDay[d] ||= { day: d, posts: 0, impressions: 0 }); byDay[d].posts++; byDay[d].impressions += r.impressions; }
  const days = Object.values(byDay); const buckets = {};
  for (const d of days) { const k = d.posts >= 3 ? '3+' : String(d.posts); (buckets[k] ||= []).push(d.impressions / d.posts); }
  return { perDay: days, avgImpressionsPerPostByDailyVolume: Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, Math.round(mean(v))])) };
}

/** Audience activity: when people who engage with you are active (mention/reply timestamps), accumulated on each sync. */
export async function recordAudience(db, client, accountId) {
  const m = await client.mentions(100).catch(() => null); if (!m?.data) return 0;
  const st = await kvGet(db, 'audience:' + accountId, { seen: [], grid: {} }); const seen = new Set(st.seen); let n = 0;
  for (const t of m.data) { if (seen.has(t.id) || !t.created_at) continue; const d = new Date(t.created_at); const k = `${d.getUTCDay()}-${d.getUTCHours()}`; st.grid[k] = (st.grid[k] || 0) + 1; seen.add(t.id); n++; }
  st.seen = [...seen].slice(-1000); await kvSet(db, 'audience:' + accountId, st); return n;
}
export const audienceGrid = async (db, accountId) => (await kvGet(db, 'audience:' + accountId, { grid: {} })).grid;

/** Interaction matrix: who interacts with you (replies/quotes/mentions), from live mentions. */
export async function interactions(client) {
  const m = await client.mentions(100); const users = new Map((m.includes?.users || []).map((u) => [u.id, u])); const out = {};
  for (const t of m.data || []) { const u = users.get(t.author_id); if (!u) continue; const o = (out[u.username] ||= { username: u.username, name: u.name, followers: u.public_metrics?.followers_count || 0, replies: 0, quotes: 0, mentions: 0, likesGiven: 0 });
    const kind = classify(t); if (kind === 'reply') o.replies++; else if (kind === 'quote') o.quotes++; else o.mentions++; o.likesGiven += t.public_metrics?.like_count || 0; }
  return Object.values(out).sort((a, b) => b.replies + b.quotes + b.mentions - (a.replies + a.quotes + a.mentions));
}
