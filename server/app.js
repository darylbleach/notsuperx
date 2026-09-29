import { config } from './config.js';
import { kvGet, kvSet, kvDel } from './db.js';
import { ai } from './ai.js';
import { bskyEnabled } from './bluesky.js';
import * as X from './x.js';
import * as core from './core.js';
import { handleMcp } from './mcp.js';

const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const sha256 = async (s) => hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));
async function hmac(msg) {
  const key = await crypto.subtle.importKey('raw', enc.encode(config.secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, enc.encode(msg)));
}
const safeEq = (a, b) => { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };

export const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...headers } });
const fail = (msg, status = 400) => json({ error: msg }, status);

const cookie = (req, name) => (req.headers.get('cookie') || '').split(/;\s*/).map((c) => c.split('=')).find(([k]) => k === name)?.[1];

async function authed(req, db) {
  const sess = cookie(req, 'nsx');
  if (sess) {
    const [exp, sig] = sess.split('.');
    if (+exp > Date.now() && safeEq(sig || '', await hmac('s' + exp))) return 'session';
  }
  const bearer = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (bearer && await db.get('SELECT 1 x FROM api_keys WHERE hash=?', await sha256(bearer))) return 'key';
  return null;
}

const P = (s) => { try { return JSON.parse(s); } catch { return []; } };
const hydrate = (p) => ({ ...p, thread: P(p.thread), media: P(p.media).map((m) => (m.dataUrl ? { ...m, dataUrl: undefined, hasData: true } : m)) });

/** Route table: [method, pattern, handler(ctx)] */
const routes = [];
const r = (method, path, fn) => routes.push([method, new RegExp('^' + path.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'), fn]);

/* ---- auth / session ---- */
r('POST', '/api/login', async ({ body }) => {
  if (!body.password || !safeEq(await sha256(body.password), await sha256(config.password))) return fail('Wrong password', 401);
  const exp = Date.now() + 30 * 864e5;
  return json({ ok: true }, 200, { 'set-cookie': `nsx=${exp}.${await hmac('s' + exp)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${30 * 86400}` });
});
r('POST', '/api/logout', async () => json({ ok: true }, 200, { 'set-cookie': 'nsx=; Path=/; Max-Age=0' }));
r('GET', '/api/status', async ({ db }) => json({
  x: !!config.xClientId, ai: !!config.anthropicKey, bluesky: bskyEnabled(),
  accounts: (await db.get('SELECT COUNT(*) n FROM accounts')).n, baseUrl: config.baseUrl,
}));

/* ---- X OAuth ---- */
r('GET', '/auth/x/start', async ({ db }) => {
  if (!config.xClientId) return fail('X_CLIENT_ID not configured');
  const state = crypto.randomUUID(); const { verifier, challenge } = await X.pkcePair();
  await kvSet(db, 'oauth:' + state, { verifier, exp: Date.now() + 600000 });
  return Response.redirect(X.authUrl(state, challenge), 302);
});
r('GET', '/auth/x/callback', async ({ db, url }) => {
  const state = url.searchParams.get('state'), code = url.searchParams.get('code');
  const st = await kvGet(db, 'oauth:' + state);
  if (!st || st.exp < Date.now() || !code) return fail('Bad OAuth state');
  await kvDel(db, 'oauth:' + state);
  const t = await X.exchangeCode(code, st.verifier);
  const tmp = new X.XClient(db, { access_token: t.access_token, expires_at: Math.floor(Date.now() / 1000) + t.expires_in });
  const me = (await tmp.me()).data;
  await db.run(`INSERT INTO accounts(x_user_id,username,name,avatar,access_token,refresh_token,expires_at,followers,following)
    VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(x_user_id) DO UPDATE SET username=excluded.username,name=excluded.name,avatar=excluded.avatar,
    access_token=excluded.access_token,refresh_token=excluded.refresh_token,expires_at=excluded.expires_at`,
    me.id, me.username, me.name, me.profile_image_url, t.access_token, t.refresh_token, Math.floor(Date.now() / 1000) + t.expires_in,
    me.public_metrics?.followers_count || 0, me.public_metrics?.following_count || 0);
  return Response.redirect(config.baseUrl + '/#/settings', 302);
});

/* ---- accounts ---- */
r('GET', '/api/accounts', async ({ db }) => json(await db.all('SELECT id,x_user_id,username,name,avatar,followers,following FROM accounts')));
r('DELETE', '/api/accounts/:id', async ({ db, p }) => { await db.run('DELETE FROM accounts WHERE id=?', p.id); return json({ ok: true }); });
r('POST', '/api/accounts/:id/sync', async ({ db, p }) => json(await core.syncAccount(db, +p.id)));

/* ---- posts / scheduler ---- */
r('GET', '/api/posts', async ({ db, url }) => {
  const q = url.searchParams, where = [], args = [];
  if (q.get('account')) { where.push('account_id=?'); args.push(+q.get('account')); }
  if (q.get('status')) { where.push('status=?'); args.push(q.get('status')); }
  const rows = await db.all(`SELECT * FROM posts ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY COALESCE(scheduled_at, created_at) DESC LIMIT 500`, ...args);
  return json(rows.map(hydrate));
});
r('POST', '/api/posts', async ({ db, body }) => {
  const { accountId, text, media = [], bluesky = false, mode = 'draft', scheduledAt, autoThread = true, tz = 0 } = body;
  if (!accountId || !text?.trim()) return fail('accountId and text required');
  let parts = body.thread?.length ? [text, ...body.thread] : autoThread ? core.splitThread(text) : [text];
  const over = parts.findIndex((t) => t.length > 280);
  if (over >= 0) return fail(`Part ${over + 1} exceeds 280 chars`);
  let status = 'draft', at = null;
  if (mode === 'schedule') { status = 'scheduled'; at = scheduledAt; if (!at || at < core.now() - 60) return fail('scheduledAt must be in the future'); }
  if (mode === 'queue') { status = 'scheduled'; at = await core.nextSlot(db, accountId, core.now(), tz); }
  if (mode === 'now') { status = 'scheduled'; at = core.now(); }
  const res = await db.run('INSERT INTO posts(account_id,text,thread,media,status,scheduled_at,bluesky,kind) VALUES(?,?,?,?,?,?,?,?)',
    accountId, parts[0], JSON.stringify(parts.slice(1)), JSON.stringify(media), status, at, bluesky ? 1 : 0, parts.length > 1 ? 'thread' : 'post');
  let post = await db.get('SELECT * FROM posts WHERE id=?', res.lastId);
  if (mode === 'now') {
    try { await core.publishPost(db, post); } catch (e) { await db.run("UPDATE posts SET status='failed', error=? WHERE id=?", e.message, post.id); }
    post = await db.get('SELECT * FROM posts WHERE id=?', post.id);
  }
  return json(hydrate(post), 201);
});
r('PATCH', '/api/posts/:id', async ({ db, p, body }) => {
  const cur = await db.get('SELECT * FROM posts WHERE id=?', p.id);
  if (!cur) return fail('Not found', 404);
  if (cur.status === 'posted') return fail('Already posted');
  const n = { text: body.text ?? cur.text, thread: JSON.stringify(body.thread ?? P(cur.thread)), scheduled_at: body.scheduledAt ?? cur.scheduled_at,
    status: body.status ?? cur.status, bluesky: body.bluesky != null ? +!!body.bluesky : cur.bluesky };
  await db.run('UPDATE posts SET text=?, thread=?, scheduled_at=?, status=?, bluesky=?, error=NULL WHERE id=?', n.text, n.thread, n.scheduled_at, n.status, n.bluesky, p.id);
  return json(hydrate(await db.get('SELECT * FROM posts WHERE id=?', p.id)));
});
r('DELETE', '/api/posts/:id', async ({ db, p, url }) => {
  const cur = await db.get('SELECT * FROM posts WHERE id=?', p.id);
  if (cur?.status === 'posted' && cur.x_post_id && url.searchParams.get('fromX') === '1') await (await core.clientFor(db, cur.account_id)).deletePost(cur.x_post_id);
  await db.run('DELETE FROM posts WHERE id=?', p.id); return json({ ok: true });
});
r('POST', '/api/posts/:id/publish', async ({ db, p }) => {
  const post = await db.get('SELECT * FROM posts WHERE id=?', p.id);
  if (!post) return fail('Not found', 404);
  try { await core.publishPost(db, post); } catch (e) { await db.run("UPDATE posts SET status='failed', error=? WHERE id=?", e.message, p.id); return fail(e.message, 502); }
  return json(hydrate(await db.get('SELECT * FROM posts WHERE id=?', p.id)));
});
r('GET', '/api/slots', async ({ db, url }) => json(await db.all('SELECT * FROM slots WHERE account_id=? ORDER BY dow,hour,minute', +url.searchParams.get('account'))));
r('PUT', '/api/slots', async ({ db, body }) => {
  await db.run('DELETE FROM slots WHERE account_id=?', body.accountId);
  for (const s of body.slots || []) await db.run('INSERT INTO slots(account_id,dow,hour,minute) VALUES(?,?,?,?)', body.accountId, s.dow, s.hour, s.minute || 0);
  return json({ ok: true });
});
r('GET', '/api/next-slot', async ({ db, url }) => json({ at: await core.nextSlot(db, +url.searchParams.get('account'), core.now(), +(url.searchParams.get('tz') || 0)) }));

/* ---- analytics ---- */
r('GET', '/api/analytics', async ({ db, url }) => json(await core.analytics(db, +url.searchParams.get('account'), +(url.searchParams.get('days') || 30))));
r('GET', '/api/analytics/export.csv', async ({ db, url }) => {
  const rows = await db.all('SELECT x_post_id,created_at,type,impressions,likes,replies,reposts,quotes,bookmarks,link_clicks,profile_clicks,text FROM metrics WHERE account_id=? ORDER BY created_at DESC', +url.searchParams.get('account'));
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = 'id,created,type,impressions,likes,replies,reposts,quotes,bookmarks,link_clicks,profile_clicks,text';
  return new Response([head, ...rows.map((x) => Object.values(x).map(esc).join(','))].join('\n'), { headers: { 'content-type': 'text/csv', 'content-disposition': 'attachment; filename=analytics.csv' } });
});
r('GET', '/api/analytics/audience', async ({ db, url }) => {
  const acc = +url.searchParams.get('account');
  const snaps = await db.all('SELECT * FROM follower_snaps WHERE account_id=? ORDER BY day', acc);
  return json({ snaps, best: (await core.bestTimes(db, acc)).slice(0, 20) });
});

/* ---- AI ---- */
r('GET', '/api/voice', async ({ db }) => json({ voice: await kvGet(db, 'voice', '') }));
r('PUT', '/api/voice', async ({ db, body }) => { await kvSet(db, 'voice', body.voice || ''); return json({ ok: true }); });
r('POST', '/api/ai/:kind', async ({ db, p, body }) => {
  const voice = body.voice ?? await kvGet(db, 'voice', '');
  const k = p.kind;
  if (k === 'ready') {
    const rows = await db.all('SELECT text FROM viral WHERE (?1=\'\' OR niche LIKE \'%\'||?1||\'%\') ORDER BY likes DESC LIMIT 8', body.niche || '');
    return json({ result: await ai.readyToPost(db, { niche: body.niche || 'general', voice, viral: rows.map((x) => x.text), count: body.count || 5 }) });
  }
  const fn = { posts: ai.posts, thread: ai.thread, rewrite: ai.rewrite, replies: ai.replies, trend: ai.fromTrend, article: ai.article, cover: ai.articleCover, audit: ai.audit, bio: ai.bio, roadmap: ai.roadmap, chat: ai.chat }[k];
  if (!fn) return fail('Unknown AI tool', 404);
  return json({ result: await fn(db, { ...body, voice, trend: body.topic && k === 'trend' ? body.topic : body.trend }) });
});
r('GET', '/api/ai/usage', async ({ db }) => json(await db.get("SELECT COUNT(*) calls, COALESCE(SUM(tokens),0) tokens FROM ai_usage WHERE created_at > unixepoch('now','start of month')")));

/* ---- viral library / trends / inspiration ---- */
r('GET', '/api/viral', async ({ db, url }) => {
  const q = url.searchParams.get('q') || '', niche = url.searchParams.get('niche') || '';
  const sort = { likes: 'likes', recent: 'saved_at', views: 'views' }[url.searchParams.get('sort')] || 'likes';
  return json(await db.all(`SELECT * FROM viral WHERE text LIKE ? AND niche LIKE ? ORDER BY ${sort} DESC LIMIT 300`, `%${q}%`, `%${niche}%`));
});
r('POST', '/api/viral', async ({ db, body }) => {
  const res = await db.run(`INSERT INTO viral(x_post_id,author,text,likes,reposts,replies,views,niche,url,source) VALUES(?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(x_post_id) DO UPDATE SET likes=excluded.likes, reposts=excluded.reposts, replies=excluded.replies, views=excluded.views, niche=COALESCE(NULLIF(excluded.niche,''),niche)`,
    body.x_post_id || crypto.randomUUID(), body.author || '', body.text, body.likes || 0, body.reposts || 0, body.replies || 0, body.views || 0, body.niche || '', body.url || '', body.source || 'manual');
  return json({ id: res.lastId }, 201);
});
r('DELETE', '/api/viral/:id', async ({ db, p }) => { await db.run('DELETE FROM viral WHERE id=?', p.id); return json({ ok: true }); });
r('POST', '/api/viral/discover', async ({ db, body }) => {
  // Build your own library: search recent posts for a niche, keep high-engagement ones.
  const client = await core.clientFor(db, body.accountId);
  const res = await client.search(`${body.query} -is:retweet -is:reply lang:en`, 100);
  const users = new Map((res.includes?.users || []).map((u) => [u.id, u]));
  let saved = 0;
  for (const t of res.data || []) {
    const m = t.public_metrics || {};
    if (m.like_count < (body.minLikes ?? 100)) continue;
    const u = users.get(t.author_id);
    const ins = await db.run('INSERT OR IGNORE INTO viral(x_post_id,author,text,likes,reposts,replies,views,niche,url,source) VALUES(?,?,?,?,?,?,?,?,?,?)',
      t.id, u?.username, t.text, m.like_count, m.retweet_count, m.reply_count, m.impression_count || 0, body.niche || body.query, `https://x.com/${u?.username}/status/${t.id}`, 'discover');
    saved += ins.changes;
  }
  return json({ saved });
});
r('GET', '/api/trends', async ({ db, url }) => {
  const client = await core.clientFor(db, +url.searchParams.get('account'));
  return json(await client.trends(+(url.searchParams.get('woeid') || 1)));
});

/* ---- mentions hub + engage ---- */
r('GET', '/api/mentions', async ({ db, url }) => {
  const ids = url.searchParams.get('account') ? [+url.searchParams.get('account')] : (await db.all('SELECT id FROM accounts')).map((a) => a.id);
  const out = [];
  for (const id of ids) {
    const client = await core.clientFor(db, id);
    try {
      const m = await client.mentions(50);
      const users = new Map((m.includes?.users || []).map((u) => [u.id, u]));
      for (const t of m.data || []) out.push({ account: client.acc.username, accountId: id, ...t, author: users.get(t.author_id) });
    } catch (e) { out.push({ accountId: id, account: client.acc.username, error: e.message }); }
  }
  return json(out.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')));
});
r('POST', '/api/reply', async ({ db, body }) => {
  const client = await core.clientFor(db, body.accountId);
  if (body.like) await client.like(body.postId).catch(() => {});
  return json(await client.createPost({ text: body.text, replyTo: body.postId }));
});
r('GET', '/api/engage/targets', async ({ db, url }) => json(await db.all('SELECT * FROM engage_targets WHERE account_id=?', +url.searchParams.get('account'))));
r('POST', '/api/engage/targets', async ({ db, body }) => {
  await db.run('INSERT INTO engage_targets(account_id,username,note) VALUES(?,?,?)', body.accountId, body.username.replace(/^@/, ''), body.note || '');
  return json({ ok: true }, 201);
});
r('DELETE', '/api/engage/targets/:id', async ({ db, p }) => { await db.run('DELETE FROM engage_targets WHERE id=?', p.id); return json({ ok: true }); });
r('GET', '/api/engage/feed', async ({ db, url }) => {
  // Strategic feed: recent posts from your target accounts, ranked by reply-opportunity (fresh + engaged, few replies)
  const acc = +url.searchParams.get('account');
  const client = await core.clientFor(db, acc);
  const feed = [];
  for (const t of await db.all('SELECT * FROM engage_targets WHERE account_id=?', acc)) {
    try {
      const u = (await client.userByUsername(t.username)).data;
      for (const tw of (await client.userTweets(u.id, 10)).data || []) {
        const m = tw.public_metrics, ageH = (Date.now() - Date.parse(tw.created_at)) / 36e5;
        feed.push({ ...tw, author: { username: u.username, name: u.name, avatar: u.profile_image_url }, score: +((m.like_count + 1) / (ageH + 2) / (1 + m.reply_count / 20)).toFixed(2) });
      }
    } catch {}
  }
  return json(feed.sort((a, b) => b.score - a.score).slice(0, 60));
});

/* ---- automations / agents ---- */
r('GET', '/api/automations', async ({ db, url }) => json((await db.all('SELECT * FROM automations WHERE account_id=?', +url.searchParams.get('account'))).map((a) => ({ ...a, config: P(a.config) }))));
r('POST', '/api/automations', async ({ db, body }) => {
  if (!['retweet', 'plug', 'dm', 'delete'].includes(body.type)) return fail('Bad type');
  const res = await db.run('INSERT INTO automations(account_id,type,config) VALUES(?,?,?)', body.accountId, body.type, JSON.stringify(body.config || {}));
  return json({ id: res.lastId }, 201);
});
r('PATCH', '/api/automations/:id', async ({ db, p, body }) => {
  if (body.enabled != null) await db.run('UPDATE automations SET enabled=? WHERE id=?', +!!body.enabled, p.id);
  if (body.config) await db.run('UPDATE automations SET config=? WHERE id=?', JSON.stringify(body.config), p.id);
  return json({ ok: true });
});
r('DELETE', '/api/automations/:id', async ({ db, p }) => { await db.run('DELETE FROM automations WHERE id=?', p.id); return json({ ok: true }); });
r('GET', '/api/automations/log', async ({ db }) => json(await db.all('SELECT l.*, a.type FROM auto_log l LEFT JOIN automations a ON a.id=l.automation_id ORDER BY l.id DESC LIMIT 200')));
r('POST', '/api/automations/run', async ({ db }) => { await core.runAutomations(db); return json({ ok: true }); });

r('GET', '/api/agents', async ({ db, url }) => json(await db.all('SELECT a.*, (SELECT COUNT(*) FROM leads WHERE agent_id=a.id) leads FROM agents a WHERE account_id=?', +url.searchParams.get('account'))));
r('POST', '/api/agents', async ({ db, body }) => {
  const res = await db.run('INSERT INTO agents(account_id,name,query,min_followers,auto_dm) VALUES(?,?,?,?,?)', body.accountId, body.name, body.query, body.minFollowers || 0, body.autoDm || '');
  return json({ id: res.lastId }, 201);
});
r('PATCH', '/api/agents/:id', async ({ db, p, body }) => { if (body.enabled != null) await db.run('UPDATE agents SET enabled=? WHERE id=?', +!!body.enabled, p.id); return json({ ok: true }); });
r('DELETE', '/api/agents/:id', async ({ db, p }) => { await db.run('DELETE FROM agents WHERE id=?', p.id); return json({ ok: true }); });
r('POST', '/api/agents/:id/run', async ({ db, p }) => json({ found: await core.runAgents(db, +p.id) }));
r('GET', '/api/agents/:id/leads', async ({ db, p }) => json(await db.all('SELECT * FROM leads WHERE agent_id=? ORDER BY followers DESC LIMIT 1000', p.id)));
r('GET', '/api/agents/:id/leads.csv', async ({ db, p }) => {
  const rows = await db.all('SELECT username,name,followers,text,dm_sent,created_at FROM leads WHERE agent_id=?', p.id);
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return new Response(['username,name,followers,text,dm_sent,created_at', ...rows.map((x) => Object.values(x).map(esc).join(','))].join('\n'), { headers: { 'content-type': 'text/csv', 'content-disposition': 'attachment; filename=leads.csv' } });
});

/* ---- tools needing the X API ---- */
r('GET', '/api/tools/lookup', async ({ db, url }) => {
  const client = await core.clientFor(db, +url.searchParams.get('account'));
  try { return json({ exists: true, user: (await client.userByUsername(url.searchParams.get('username'))).data }); }
  catch (e) { return json({ exists: false, note: e.message }); }
});
r('GET', '/api/tools/audit', async ({ db, url }) => {
  const client = await core.clientFor(db, +url.searchParams.get('account'));
  const u = (await client.userByUsername(url.searchParams.get('username'))).data;
  const posts = (await client.userTweets(u.id, 30)).data || [];
  const top = [...posts].sort((a, b) => b.public_metrics.like_count - a.public_metrics.like_count).slice(0, 5);
  const avg = posts.length ? posts.reduce((s, x) => s + x.public_metrics.like_count, 0) / posts.length : 0;
  return json({ user: u, report: await ai.audit(db, { profile: u, topPosts: top.map((t) => t.text), stats: { avgLikes: avg, posts: posts.length } }) });
});
r('GET', '/api/tools/shadowban', async ({ db, url }) => {
  // Heuristic: are the user's recent posts discoverable via search?
  const client = await core.clientFor(db, +url.searchParams.get('account'));
  const username = url.searchParams.get('username');
  const u = (await client.userByUsername(username)).data;
  const own = (await client.userTweets(u.id, 10)).data || [];
  const found = (await client.search(`from:${username} -is:retweet`, 50)).data || [];
  const ids = new Set(found.map((t) => t.id));
  const visible = own.filter((t) => ids.has(t.id)).length;
  return json({ checked: own.length, visibleInSearch: visible, likelyRestricted: own.length >= 5 && visible === 0, note: 'Heuristic only; X provides no official shadowban signal.' });
});
r('GET', '/api/tools/media', async ({ db, url }) => {
  const id = (url.searchParams.get('url') || '').match(/status\/(\d+)/)?.[1] || url.searchParams.get('url');
  const client = await core.clientFor(db, +url.searchParams.get('account'));
  const d = await client.getPostFull(id);
  const media = (d.includes?.media || []).map((m) => ({
    type: m.type, url: m.url, preview: m.preview_image_url,
    best: m.variants?.filter((v) => v.content_type === 'video/mp4').sort((a, b) => (b.bit_rate || 0) - (a.bit_rate || 0))[0]?.url || m.url,
  }));
  return json({ text: d.data.text, author: d.includes?.users?.[0], media });
});
r('POST', '/api/tools/bulk-delete', async ({ db, body }) => {
  const client = await core.clientFor(db, body.accountId);
  const rows = await db.all('SELECT x_post_id FROM metrics WHERE account_id=? AND likes<=? AND created_at<? LIMIT ?', body.accountId, body.maxLikes ?? 0, core.now() - (body.olderThanDays ?? 30) * 86400, body.limit ?? 50);
  if (body.dryRun) return json({ wouldDelete: rows.length });
  let n = 0;
  for (const x of rows) { try { await client.deletePost(x.x_post_id); await db.run('DELETE FROM metrics WHERE x_post_id=?', x.x_post_id); n++; } catch {} }
  return json({ deleted: n });
});

/* ---- API keys ---- */
r('GET', '/api/keys', async ({ db }) => json(await db.all('SELECT id,name,created_at FROM api_keys')));
r('POST', '/api/keys', async ({ db, body }) => {
  const key = 'nsx_' + hex(crypto.getRandomValues(new Uint8Array(24)));
  await db.run('INSERT INTO api_keys(name,hash) VALUES(?,?)', body.name || 'key', await sha256(key));
  return json({ key }, 201);
});
r('DELETE', '/api/keys/:id', async ({ db, p }) => { await db.run('DELETE FROM api_keys WHERE id=?', p.id); return json({ ok: true }); });

/* ---- MCP (streamable HTTP JSON-RPC) ---- */
r('POST', '/mcp', async ({ db, body }) => json(await handleMcp(db, body)));

/** Entry point: Request -> Response. `assets` optional fetcher for static files (local dev). */
export async function handle(req, env, db) {
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/$/, '') || '/';
  const isApi = path.startsWith('/api/') || path.startsWith('/auth/') || path === '/mcp';
  if (!isApi) return null;
  const open = ['/api/login', '/api/logout', '/api/status'].includes(path) || path === '/auth/x/callback';
  if (!open && !(await authed(req, db))) return fail('Unauthorized', 401);
  for (const [method, re, fn] of routes) {
    if (method !== req.method) continue;
    const m = path.match(re);
    if (!m) continue;
    let body = {};
    if (['POST', 'PUT', 'PATCH'].includes(req.method)) { try { body = await req.json(); } catch {} }
    try { return await fn({ req, url, db, env, p: m.groups || {}, body }); }
    catch (e) { return fail(e.message, e.status && e.status < 600 && e.status >= 400 ? 502 : 500); }
  }
  return fail('Not found', 404);
}
