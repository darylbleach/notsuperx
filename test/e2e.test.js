import test from 'node:test';
import assert from 'node:assert/strict';
import { startMock, state, seedData } from '../mock/mock-x.js';
import { openNodeDb, kvSet } from '../server/db.js';
import { initConfig } from '../server/config.js';
import { handle } from '../server/app.js';
import * as core from '../server/core.js';

const PORT = 9411;
const srv = await startMock(PORT);
const env = { APP_PASSWORD: 'pw', SESSION_SECRET: 's', BASE_URL: 'http://t', X_CLIENT_ID: 'cid', X_CLIENT_SECRET: 'sec', X_API_BASE: `http://localhost:${PORT}/2`, X_AUTH_BASE: `http://localhost:${PORT}/authorize`,
  ANTHROPIC_API_KEY: 'k', ANTHROPIC_API_BASE: `http://localhost:${PORT}`, BSKY_HANDLE: 'h', BSKY_APP_PASSWORD: 'p', BSKY_API_BASE: `http://localhost:${PORT}/xrpc` };
initConfig(env);

const db = await openNodeDb(':memory:');
await db.run("INSERT INTO accounts(id,x_user_id,username,access_token,refresh_token,expires_at) VALUES(1,'1','demo','tok','ref',?)", core.now() + 9999);
let cookie;
const call = async (method, path, body) => {
  const res = await handle(new Request('http://t' + path, { method, body: body ? JSON.stringify(body) : undefined, headers: cookie ? { cookie } : {} }), env, db);
  return res;
};
const J = async (...a) => { const r = await call(...a); const j = await r.json(); if (!r.ok) throw new Error(`${a[1]} -> ${r.status} ${j.error}`); return j; };
cookie = (await call('POST', '/api/login', { password: 'pw' })).headers.get('set-cookie').split(';')[0];

test('oauth flow via mock', async () => {
  const start = await call('GET', '/auth/x/start');
  const loc = start.headers.get('location'); assert.match(loc, /localhost:9411\/authorize/);
  const authz = await fetch(loc, { redirect: 'manual' }); const back = new URL(authz.headers.get('location'));
  const res = await handle(new Request(back), env, db);
  assert.equal(res.status, 302);
  assert.equal((await db.get('SELECT username FROM accounts WHERE x_user_id=?', '1')).username, 'demo');
});

test('sync pulls posts, followers, audience', async () => {
  const r = await J('POST', '/api/accounts/1/sync', {});
  assert.ok(r.synced >= 60); assert.equal(r.followers, 4200);
  const a = await J('GET', '/api/analytics?account=1&days=30');
  assert.ok(a.impressions > 0 && a.byType.length >= 2 && a.followerSeries.length === 1);
  assert.ok(Object.keys(await (await import('../server/insights.js')).audienceGrid(db, 1)).length > 0);
});

test('insights, tweet tester, valuation, profile, health', async () => {
  const ins = await J('GET', '/api/insights?account=1'); assert.ok(ins.comparison.length >= 3 && ins.best.length === 5);
  const good = await J('POST', '/api/tools/tweet-tester', { accountId: 1, text: 'I made $10k in 30 days.\n\nHere is exactly how, step by step.\n\nWhat would you add?' });
  const bad = await J('POST', '/api/tools/tweet-tester', { accountId: 1, text: 'Ask me anything! Follow for more, delve into https://x.co #a #b' });
  assert.ok(good.score > bad.score, `${good.score} vs ${bad.score}`); assert.ok(bad.hurts.length >= 3);
  const v = await J('GET', '/api/tools/valuation?account=1&username=ada');
  assert.equal(v.months, 24); assert.ok(v.multiplier >= 0.5 && v.multiplier <= 2); assert.equal(v.accountValue, v.sponsoredPostPrice * 96);
  const p = await J('GET', '/api/profile?account=1&username=grace');
  assert.ok(p.health.score >= 0 && p.health.score <= 100 && p.archetype && p.topPosts.length === 5 && p.metrics.views.median >= 0);
  const c = await J('GET', '/api/tools/counter?account=1&username=linus'); assert.ok(c.followers_count > 0);
  const m = await J('GET', '/api/tools/metrics?account=1&username=ada'); assert.ok(m.views.total > 0);
});

test('publish now (thread + bluesky), schedule via cron, queue', async () => {
  const before = state.tweets.length; state.bsky.length = 0;
  const long = Array.from({ length: 6 }, (_, i) => `Part ${i} ` + 'word '.repeat(40)).join('\n\n');
  const p = await J('POST', '/api/posts', { accountId: 1, text: long, mode: 'now', bluesky: true });
  assert.equal(p.status, 'posted'); assert.ok(state.tweets.length - before >= 2); assert.ok(state.bsky.length >= 2);
  const s = await J('POST', '/api/posts', { accountId: 1, text: 'scheduled one', mode: 'schedule', scheduledAt: core.now() + 1 });
  await db.run('UPDATE posts SET scheduled_at=? WHERE id=?', core.now() - 1, s.id);
  await core.cronTick(db, new Date('2026-01-01T00:07:00Z'));
  assert.equal((await db.get('SELECT status FROM posts WHERE id=?', s.id)).status, 'posted');
  const q = await J('POST', '/api/posts', { accountId: 1, text: 'queued', mode: 'queue' }); assert.equal(q.status, 'scheduled');
  await db.run("UPDATE posts SET status='draft'"); // cleanup for later tests
});

test('automations: plug, retweet, delete(dry+real), dm', async () => {
  const mk = (type, config) => J('POST', '/api/automations', { accountId: 1, type, config });
  await mk('plug', { likeThreshold: 0, text: 'Get the guide: https://ex.co' });
  await mk('retweet', { afterHours: 0, minLikes: 0 });
  await mk('delete', { afterHours: 0, maxEngagement: 0, dryRun: true });
  await mk('dm', { text: 'thanks for replying!' });
  const calls0 = state.calls.length;
  await core.runAutomations(db);
  const log = await J('GET', '/api/automations/log');
  const acts = new Set(log.map((l) => l.action));
  assert.ok(acts.has('plug') && acts.has('retweet'), [...acts].join());
  assert.ok(state.calls.slice(calls0).some((c) => c.includes('/retweets')));
  const errs = log.filter((l) => l.action === 'error'); assert.equal(errs.length, 0, errs[0]?.detail);
});

test('signal agent finds leads and auto-dms', async () => {
  state.dms.length = 0;
  const { id } = await J('POST', '/api/agents', { accountId: 1, name: 'crm', query: '"Looking for" CRM', minFollowers: 0, autoDm: 'Hey, saw your CRM post — want a demo?' });
  const r = await J('POST', `/api/agents/${id}/run`, {}); assert.ok(r.found >= 3);
  assert.ok(state.dms.length >= 3); assert.equal((await J('GET', `/api/agents/${id}/leads`)).length, r.found);
  const csv = await (await call('GET', `/api/agents/${id}/leads.csv`)).text(); assert.match(csv, /^username,name/);
});

test('mentions, inbox (replies/quotes), interactions, shield, reply', async () => {
  const m = await J('GET', '/api/mentions'); assert.ok(m.length >= 8);
  const inbox = await J('GET', '/api/inbox?account=1'); assert.ok(inbox.some((x) => x.kind === 'quote') && inbox.some((x) => x.kind === 'reply'));
  await J('POST', '/api/inbox/handled', { accountId: 1, postId: inbox[0].id });
  assert.equal((await J('GET', '/api/inbox?account=1')).find((x) => x.id === inbox[0].id).handled, true);
  const mat = await J('GET', '/api/interactions?account=1'); assert.ok(mat.length && mat[0].replies + mat[0].quotes + mat[0].mentions > 0);
  const sh = await J('POST', '/api/shield', { text: "Great post! Thanks for sharing — this really resonates and it's a game-changer." }); assert.ok(sh.score >= 60);
  const human = await J('POST', '/api/shield', { text: 'nah, tried this in 2023 and churn went up 12%' }); assert.ok(human.score < 35);
  const before = state.tweets.length; await J('POST', '/api/reply', { accountId: 1, postId: inbox[0].id, text: 'thanks!', like: true }); assert.equal(state.tweets.length, before + 1);
});

test('engage feed, discover viral, daily inspiration, trends, timelines, creators', async () => {
  await J('POST', '/api/engage/targets', { accountId: 1, username: '@ada' });
  const feed = await J('GET', '/api/engage/feed?account=1'); assert.ok(feed.length > 0 && feed[0].score >= feed.at(-1).score);
  const d = await J('POST', '/api/viral/discover', { accountId: 1, query: 'saas pricing', minLikes: 1, niche: 'saas' }); assert.ok(d.saved > 0);
  await J('PUT', '/api/niches', { niches: [{ name: 'ai', query: 'AI agents', minLikes: 1, perDay: 5 }] });
  const ran = await J('POST', '/api/inspiration/run', {}); assert.ok(ran.saved > 0);
  assert.ok((await J('GET', '/api/inspiration/today')).length > 0);
  const t = await J('GET', '/api/trends?account=1'); assert.ok(t.data.length > 3);
  const tl = await J('POST', '/api/timelines', { accountId: 1, name: 'founders', query: 'pricing', users: ['@ada', 'grace'] });
  assert.ok((await J('GET', `/api/timelines/${tl.id}/feed`)).length >= 0);
  const c = await J('POST', '/api/discover/creators', { accountId: 1, query: 'indie hacking', minFollowers: 0 }); assert.ok(c.length > 0);
  assert.ok((await J('GET', '/api/creators?account=1')).length > 0);
});

test('AI endpoints (mock) + tools + articles + templates + limits', async () => {
  for (const k of ['posts', 'thread', 'rewrite', 'replies', 'trend', 'ready', 'bio']) { const r = await J('POST', '/api/ai/' + k, { topic: 'x', text: 'x', trend: 'x', about: 'x', niche: 'saas' }); assert.ok(r.result.length, k); }
  assert.ok((await J('POST', '/api/ai-tools/factcheck', { text: 'The moon is cheese' })).result);
  assert.ok((await J('POST', '/api/profile/chat', { accountId: 1, username: 'ada', question: 'what do they post about?' })).result);
  assert.ok((await J('POST', '/api/ai-tools/roast', { accountId: 1, username: 'ada' })).result);
  const dz = await J('POST', '/api/ai-tools/doomscroll', { accountId: 1, username: 'ada', niche: 'saas' }); assert.ok(dz.result.length && dz.result[0].verdict);
  assert.equal((await J('POST', '/api/ai-tools/write', { kind: 'tweets', topic: 'x' })).result.length, 3);
  const media = await J('GET', `/api/tools/media?account=1&url=https://x.com/a/status/${state.tweets.find((t) => t.attachments).id}`);
  assert.match(media.media[0].best, /v_high/);
  const sb = await J('GET', '/api/tools/shadowban?account=1&username=ada'); assert.equal(typeof sb.likelyRestricted, 'boolean');
  assert.ok((await J('GET', '/api/tools/audit?account=1&username=ada')).report);
  assert.equal((await J('GET', '/api/tools/lookup?account=1&username=nobody_here')).exists, false);
  // articles
  const a = await J('POST', '/api/articles', { accountId: 1, title: 'T', markdown: '# Hi\n\n**bold** and [l](https://x.co)\n\n- a\n- b' });
  const html = await (await call('GET', `/api/articles/${a.id}/export.html`)).text(); assert.match(html, /<strong>bold<\/strong>/); assert.match(html, /<li>a<\/li>/);
  const tpl = await J('POST', '/api/templates', { title: 'x', body: 'y' }); assert.ok(tpl.id);
  // limits
  await J('PUT', '/api/limits', { postsPerMonth: 1 });
  await db.run("DELETE FROM posts");
  assert.equal((await call('POST', '/api/posts', { accountId: 1, text: 'within limit', mode: 'queue' })).status, 201);
  const lim = await call('POST', '/api/posts', { accountId: 1, text: 'over limit', mode: 'queue' }); assert.equal(lim.status, 429);
  await J('PUT', '/api/limits', {});
  // bulk delete
  const bd = await J('POST', '/api/tools/bulk-delete', { accountId: 1, olderThanDays: 0, maxLikes: 0, dryRun: true }); assert.ok(bd.wouldDelete >= 0);
});

test('login rate limit', async () => {
  let last; for (let i = 0; i < 9; i++) last = await call('POST', '/api/login', { password: 'bad' });
  assert.equal(last.status, 429);
});

test.after(() => srv.close());
