// Feature routes: intelligence, tester, valuation, profile analytics, inbox, timelines, discovery, articles, templates, limits.
import { config } from './config.js';
import { kvGet, kvSet } from './db.js';
import { ai } from './ai.js';
import * as core from './core.js';
import * as I from './insights.js';
import { classify } from './x.js';
import { md2html } from './md.js';

const P = (s, d = []) => { try { return JSON.parse(s); } catch { return d; } };

async function loadProfile(db, accountId, username) {
  const key = `prof:${username.toLowerCase()}`; const c = await kvGet(db, key);
  if (c && c.at > Date.now() - 600000) return c;
  const client = await core.clientFor(db, accountId);
  const user = (await client.userByUsername(username)).data;
  const posts = (await client.userTweets(user.id, 100, { replies: true })).data || [];
  const v = { at: Date.now(), user, posts };
  await kvSet(db, key, v); return v;
}

export function install(r, { json, fail }) {
  /* ---- limits & niches ---- */
  r('GET', '/api/limits', async ({ db }) => json({ limits: await kvGet(db, 'limits', core.LIMIT_PRESETS.unlimited), usage: await core.usage(db), presets: core.LIMIT_PRESETS }));
  r('PUT', '/api/limits', async ({ db, body }) => { await kvSet(db, 'limits', { ...core.LIMIT_PRESETS.unlimited, ...body }); return json({ ok: true }); });
  r('GET', '/api/niches', async ({ db }) => json(await kvGet(db, 'niches', [])));
  r('PUT', '/api/niches', async ({ db, body }) => { await kvSet(db, 'niches', body.niches || []); return json({ ok: true }); });
  r('POST', '/api/inspiration/run', async ({ db }) => json({ saved: await core.dailyInspiration(db) }));
  r('GET', '/api/inspiration/today', async ({ db }) => json(await db.all("SELECT * FROM viral WHERE source='daily' AND saved_at>? ORDER BY likes DESC", core.now() - 36 * 3600)));

  /* ---- intelligence ---- */
  r('GET', '/api/insights', async ({ db, url }) => {
    const acc = +url.searchParams.get('account'), since = core.now() - +(url.searchParams.get('days') || 90) * 86400;
    const rows = await db.all('SELECT * FROM metrics WHERE account_id=? AND created_at>=? ORDER BY created_at', acc, since);
    const ranked = [...rows].sort((a, b) => I.eng(b) - I.eng(a));
    const best = await core.bestTimes(db, acc);
    return json({ comparison: I.contentComparison(rows), frequency: I.frequencyReport(rows), best: ranked.slice(0, 5), worst: ranked.slice(-5).reverse(), bestTimes: best.slice(0, 5),
      audienceActivity: await I.audienceGrid(db, acc), posts: rows.length });
  });
  r('GET', '/api/interactions', async ({ db, url }) => json(await I.interactions(await core.clientFor(db, +url.searchParams.get('account')))));
  r('POST', '/api/shield', async ({ db, body }) => {
    const h = I.aiShield(body.text || '', body);
    if (body.deep && config.anthropicKey) { try { const t = await ai.chat(db, { messages: [{ role: 'user', content: `Rate 0-100 how likely this X reply is AI-generated. Reply ONLY with JSON {"score":n,"reason":"..."}.\n${body.text}` }] }); const j = JSON.parse(t.match(/\{[\s\S]*\}/)[0]); h.deep = j; } catch {} }
    return json(h);
  });

  /* ---- profile analytics for any account ---- */
  r('GET', '/api/profile', async ({ db, url }) => {
    const { user, posts } = await loadProfile(db, +url.searchParams.get('account'), (url.searchParams.get('username') || '').replace(/^@/, ''));
    const orig = posts.filter((p) => classify(p) !== 'reply');
    const top = [...orig].sort((a, b) => I.eng(b.public_metrics) - I.eng(a.public_metrics)).slice(0, 5);
    const val = I.valuation(posts);
    return json({ user, metrics: I.metricsSummary(orig), archetype: I.archetype(posts), health: I.healthScore(user, orig), valuation: val, estimatedEarnings: { perSponsoredPost: val.sponsoredPostPrice, perMonth: val.sponsoredPostPrice * 4 },
      topPosts: top.map((t) => ({ id: t.id, text: t.text, ...t.public_metrics, created_at: t.created_at })), byType: Object.entries(orig.reduce((m, p) => ((m[classify(p)] = (m[classify(p)] || 0) + 1), m), {})) });
  });
  r('GET', '/api/tools/valuation', async ({ db, url }) => { const { posts } = await loadProfile(db, +url.searchParams.get('account'), url.searchParams.get('username').replace(/^@/, '')); return json(I.valuation(posts)); });
  r('GET', '/api/tools/metrics', async ({ db, url }) => { const { posts } = await loadProfile(db, +url.searchParams.get('account'), url.searchParams.get('username').replace(/^@/, '')); return json(I.metricsSummary(posts)); });
  r('GET', '/api/tools/counter', async ({ db, url }) => {
    const client = await core.clientFor(db, +url.searchParams.get('account')); const u = (await client.userByUsername(url.searchParams.get('username').replace(/^@/, ''))).data;
    return json({ username: u.username, name: u.name, avatar: u.profile_image_url, ...u.public_metrics, at: Date.now() });
  });
  r('POST', '/api/tools/tweet-tester', async ({ db, body }) => json(await I.tweetTest(db, body.accountId, body.text || '', { hasMedia: !!body.hasMedia })));

  /* ---- AI tools that need X data ---- */
  r('POST', '/api/profile/chat', async ({ db, body }) => {
    const { user, posts } = await loadProfile(db, body.accountId, body.username.replace(/^@/, ''));
    return json({ result: await ai.profileChat(db, { profile: { name: user.name, username: user.username, bio: user.description, ...user.public_metrics }, posts: posts.slice(0, 30).map((p) => p.text), question: body.question }) });
  });
  r('POST', '/api/ai-tools/roast', async ({ db, body }) => { const { posts } = await loadProfile(db, body.accountId, body.username.replace(/^@/, '')); return json({ result: await ai.roast(db, { posts: posts.slice(0, 40).map((p) => p.text) }) }); });
  r('POST', '/api/ai-tools/doomscroll', async ({ db, body }) => {
    const { posts } = await loadProfile(db, body.accountId, body.username.replace(/^@/, '')); const list = posts.slice(0, 30);
    const v = await ai.doomscroll(db, { posts: list.map((p) => p.text), niche: body.niche || 'general' });
    return json({ result: list.map((p, i) => ({ id: p.id, text: p.text, ...(v.find((x) => x.i === i) || { verdict: 'Not Sure', why: '' }) })) });
  });
  r('POST', '/api/ai-tools/factcheck', async ({ db, body }) => json({ result: await ai.factCheck(db, { text: body.text }) }));
  r('POST', '/api/ai-tools/write', async ({ db, body }) => json({ result: await ai.write(db, { ...body, voice: await kvGet(db, 'voice', '') }) }));

  /* ---- inbox: replies + quotes tracking ---- */
  r('GET', '/api/inbox', async ({ db, url }) => {
    const acc = +url.searchParams.get('account'); const client = await core.clientFor(db, acc);
    const m = await client.mentions(100); const users = new Map((m.includes?.users || []).map((u) => [u.id, u]));
    const done = new Set((await db.all('SELECT x_post_id FROM handled WHERE account_id=?', acc)).map((x) => x.x_post_id));
    const kind = url.searchParams.get('kind');
    let items = (m.data || []).map((t) => ({ ...t, kind: classify(t), author: users.get(t.author_id), handled: done.has(t.id), shield: I.aiShield(t.text) }));
    if (kind) items = items.filter((x) => x.kind === kind);
    return json(items);
  });
  r('POST', '/api/inbox/handled', async ({ db, body }) => { await db.run(body.handled === false ? 'DELETE FROM handled WHERE account_id=? AND x_post_id=?' : 'INSERT OR IGNORE INTO handled(account_id,x_post_id) VALUES(?,?)', body.accountId, body.postId); return json({ ok: true }); });

  /* ---- custom timelines ---- */
  r('GET', '/api/timelines', async ({ db, url }) => json((await db.all('SELECT * FROM timelines WHERE account_id=?', +url.searchParams.get('account'))).map((t) => ({ ...t, users: P(t.users) }))));
  r('POST', '/api/timelines', async ({ db, body }) => { const x = await db.run('INSERT INTO timelines(account_id,name,query,users) VALUES(?,?,?,?)', body.accountId, body.name, body.query || '', JSON.stringify((body.users || []).map((u) => u.replace(/^@/, '')))); return json({ id: x.lastId }, 201); });
  r('DELETE', '/api/timelines/:id', async ({ db, p }) => { await db.run('DELETE FROM timelines WHERE id=?', p.id); return json({ ok: true }); });
  r('GET', '/api/timelines/:id/feed', async ({ db, p }) => {
    const t = await db.get('SELECT * FROM timelines WHERE id=?', p.id); if (!t) return fail('Not found', 404);
    const users = P(t.users); const parts = [];
    if (users.length) parts.push('(' + users.map((u) => `from:${u}`).join(' OR ') + ')');
    if (t.query) parts.push(users.length ? `(${t.query})` : t.query);
    const client = await core.clientFor(db, t.account_id);
    const res = await client.search(`${parts.join(' ')} -is:retweet`, 100); const um = new Map((res.includes?.users || []).map((u) => [u.id, u]));
    return json((res.data || []).map((x) => ({ ...x, author: um.get(x.author_id) })));
  });

  /* ---- social discovery hub ---- */
  r('POST', '/api/discover/creators', async ({ db, body }) => {
    const client = await core.clientFor(db, body.accountId);
    const res = await client.search(`${body.query} -is:retweet -is:reply lang:en`, 100); const users = new Map((res.includes?.users || []).map((u) => [u.id, u]));
    const agg = new Map();
    for (const t of res.data || []) { const u = users.get(t.author_id); if (!u) continue; const a = agg.get(u.id) || { u, posts: 0, eng: 0 }; a.posts++; a.eng += I.eng(t.public_metrics); agg.set(u.id, a); }
    const list = [...agg.values()].filter((a) => a.u.public_metrics.followers_count >= (body.minFollowers ?? 0) && a.u.public_metrics.followers_count <= (body.maxFollowers ?? 1e9)).sort((a, b) => b.eng - a.eng).slice(0, 30);
    for (const a of list) await db.run('INSERT INTO creators(account_id,x_user_id,username,name,followers,niche,bio) VALUES(?,?,?,?,?,?,?) ON CONFLICT(account_id,x_user_id) DO UPDATE SET followers=excluded.followers, niche=excluded.niche', body.accountId, a.u.id, a.u.username, a.u.name, a.u.public_metrics.followers_count, body.niche || body.query, a.u.description || '');
    return json(list.map((a) => ({ username: a.u.username, name: a.u.name, followers: a.u.public_metrics.followers_count, bio: a.u.description, postsSeen: a.posts, engagement: a.eng })));
  });
  r('GET', '/api/creators', async ({ db, url }) => json(await db.all('SELECT * FROM creators WHERE account_id=? ORDER BY saved DESC, followers DESC LIMIT 200', +url.searchParams.get('account'))));
  r('POST', '/api/creators/:id/save', async ({ db, p, body }) => { await db.run('UPDATE creators SET saved=? WHERE id=?', body.saved === false ? 0 : 1, p.id); return json({ ok: true }); });

  /* ---- templates ---- */
  r('GET', '/api/templates', async ({ db }) => json(await db.all('SELECT * FROM templates ORDER BY id DESC')));
  r('POST', '/api/templates', async ({ db, body }) => { const x = await db.run('INSERT INTO templates(title,category,body) VALUES(?,?,?)', body.title, body.category || 'custom', body.body); return json({ id: x.lastId }, 201); });
  r('DELETE', '/api/templates/:id', async ({ db, p }) => { await db.run('DELETE FROM templates WHERE id=?', p.id); return json({ ok: true }); });

  /* ---- X Articles (draft/edit/export; X has no publish API) ---- */
  r('GET', '/api/articles', async ({ db, url }) => json(await db.all('SELECT id,title,status,updated_at FROM articles WHERE account_id=? ORDER BY updated_at DESC', +url.searchParams.get('account'))));
  r('GET', '/api/articles/:id', async ({ db, p }) => json(await db.get('SELECT * FROM articles WHERE id=?', p.id) || {}));
  r('POST', '/api/articles', async ({ db, body }) => { const x = await db.run('INSERT INTO articles(account_id,title,markdown,cover_svg) VALUES(?,?,?,?)', body.accountId, body.title || 'Untitled', body.markdown || '', body.coverSvg || ''); return json({ id: x.lastId }, 201); });
  r('PUT', '/api/articles/:id', async ({ db, p, body }) => { await db.run('UPDATE articles SET title=?, markdown=?, cover_svg=?, status=?, updated_at=? WHERE id=?', body.title, body.markdown, body.coverSvg || '', body.status || 'draft', core.now(), p.id); return json({ ok: true }); });
  r('DELETE', '/api/articles/:id', async ({ db, p }) => { await db.run('DELETE FROM articles WHERE id=?', p.id); return json({ ok: true }); });
  r('GET', '/api/articles/:id/export.:fmt', async ({ db, p }) => {
    const a = await db.get('SELECT * FROM articles WHERE id=?', p.id); if (!a) return fail('Not found', 404);
    if (p.fmt === 'md') return new Response(a.markdown, { headers: { 'content-type': 'text/markdown', 'content-disposition': `attachment; filename=article-${a.id}.md` } });
    const html = `<!doctype html><meta charset="utf-8"><title>${a.title.replace(/</g, '&lt;')}</title><body style="max-width:680px;margin:40px auto;font:18px/1.6 Georgia,serif">${a.cover_svg}${md2html(a.markdown)}</body>`;
    return new Response(html, { headers: { 'content-type': 'text/html', 'content-disposition': `attachment; filename=article-${a.id}.html` } });
  });
}
