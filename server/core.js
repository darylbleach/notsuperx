import { XClient, classify } from './x.js';
import { crosspost, bskyEnabled } from './bluesky.js';
import { ai } from './ai.js';
import { kvGet } from './db.js';

export const now = () => Math.floor(Date.now() / 1000);
const J = (s, d) => { try { return JSON.parse(s); } catch { return d; } };

export const getAccount = (db, id) => db.get('SELECT * FROM accounts WHERE id=?', id);
export async function clientFor(db, id) {
  const a = await getAccount(db, id);
  if (!a) throw new Error('Unknown account');
  return new XClient(db, a);
}

/* ---------- Smart scheduler ---------- */

/** Next free slot for an account after `after` (unix). Uses configured slots, else best-time heuristic. */
export async function nextSlot(db, accountId, after = now(), tzMinutes = 0) {
  let slots = await db.all('SELECT dow,hour,minute FROM slots WHERE account_id=?', accountId);
  if (!slots.length) {
    const best = (await bestTimes(db, accountId)).slice(0, 6);
    slots = best.length ? best.map((b) => ({ dow: b.dow, hour: b.hour, minute: 0 }))
      : [9, 12, 17].flatMap((h) => [0, 1, 2, 3, 4, 5, 6].map((d) => ({ dow: d, hour: h, minute: 0 })));
  }
  const taken = new Set((await db.all("SELECT scheduled_at FROM posts WHERE account_id=? AND status='scheduled'", accountId)).map((r) => r.scheduled_at));
  const start = new Date((after + 60) * 1000);
  for (let d = 0; d < 60; d++) {
    const day = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + d));
    const cands = slots.filter((s) => s.dow === day.getUTCDay())
      .map((s) => Math.floor(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), s.hour, s.minute) / 1000) + tzMinutes * 60)
      .sort((a, b) => a - b);
    for (const c of cands) if (c > after && !taken.has(c)) return c;
  }
  return after + 3600;
}

/** Best posting times from historical engagement: avg weighted engagement by dow/hour (UTC). */
export async function bestTimes(db, accountId) {
  const rows = await db.all('SELECT created_at, likes, replies, reposts, quotes, bookmarks FROM metrics WHERE account_id=? AND created_at IS NOT NULL', accountId);
  const cells = new Map();
  for (const r of rows) {
    const d = new Date(r.created_at * 1000);
    const key = `${d.getUTCDay()}-${d.getUTCHours()}`;
    const eng = r.likes + r.replies * 3 + r.reposts * 2 + r.quotes * 2 + r.bookmarks;
    const c = cells.get(key) || { dow: d.getUTCDay(), hour: d.getUTCHours(), n: 0, eng: 0 };
    c.n++; c.eng += eng; cells.set(key, c);
  }
  return [...cells.values()].map((c) => ({ ...c, score: c.eng / c.n })).sort((a, b) => b.score - a.score);
}

/* ---------- Publishing ---------- */

export function splitThread(text, limit = 275) {
  if (text.length <= 280) return [text];
  const parts = []; let cur = '';
  const pushWords = (para) => {
    cur = '';
    for (const w of para.split(' ')) { if ((cur + ' ' + w).trim().length > limit) { parts.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); }
  };
  for (const para of text.split(/\n{2,}/)) {
    if ((cur + '\n\n' + para).trim().length <= limit) cur = (cur ? cur + '\n\n' : '') + para;
    else {
      if (cur) parts.push(cur);
      if (para.length <= limit) cur = para; else pushWords(para);
    }
  }
  if (cur) parts.push(cur);
  return parts;
}

const b64bytes = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

export async function publishPost(db, post) {
  const client = await clientFor(db, post.account_id);
  const parts = [post.text, ...J(post.thread, [])].filter(Boolean);
  const mediaIds = [];
  for (const m of J(post.media, [])) {
    if (m.dataUrl) {
      const [, mime, b64] = m.dataUrl.match(/^data:([^;]+);base64,(.*)$/) || [];
      if (b64) mediaIds.push(await client.uploadMedia(b64bytes(b64), mime));
    } else if (m.id) mediaIds.push(m.id);
  }
  const ids = await client.postThread(parts, mediaIds);
  let err = null;
  if (post.bluesky && bskyEnabled()) { try { await crosspost(parts); } catch (e) { err = 'bluesky: ' + e.message; } }
  await db.run("UPDATE posts SET status='posted', posted_at=?, x_post_id=?, error=? WHERE id=?", now(), ids[0], err, post.id);
  return ids;
}

export async function runDuePosts(db) {
  const due = await db.all("SELECT * FROM posts WHERE status='scheduled' AND scheduled_at<=? ORDER BY scheduled_at LIMIT 20", now());
  for (const p of due) {
    const claim = await db.run("UPDATE posts SET status='posting' WHERE id=? AND status='scheduled'", p.id);
    if (!claim.changes) continue;
    try { await publishPost(db, p); }
    catch (e) { await db.run("UPDATE posts SET status='failed', error=? WHERE id=?", e.message, p.id); }
  }
  return due.length;
}

/* ---------- Analytics sync ---------- */

export async function syncAccount(db, accountId) {
  const client = await clientFor(db, accountId);
  const me = (await client.me()).data;
  const pm = me.public_metrics || {};
  await db.run('UPDATE accounts SET followers=?, following=?, name=?, avatar=?, username=? WHERE id=?',
    pm.followers_count || 0, pm.following_count || 0, me.name, me.profile_image_url, me.username, accountId);
  await db.run('INSERT OR REPLACE INTO follower_snaps(account_id,day,followers,following) VALUES(?,?,?,?)',
    accountId, new Date().toISOString().slice(0, 10), pm.followers_count || 0, pm.following_count || 0);

  let n = 0;
  const tl = await client.timeline({ max: 100 });
  for (const t of tl.data || []) {
    const p = t.public_metrics || {}, np = t.non_public_metrics || {};
    await db.run(`INSERT INTO metrics(x_post_id,account_id,text,created_at,type,impressions,likes,replies,reposts,quotes,bookmarks,link_clicks,profile_clicks,fetched_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(x_post_id) DO UPDATE SET impressions=excluded.impressions, likes=excluded.likes, replies=excluded.replies,
      reposts=excluded.reposts, quotes=excluded.quotes, bookmarks=excluded.bookmarks, link_clicks=excluded.link_clicks,
      profile_clicks=excluded.profile_clicks, fetched_at=excluded.fetched_at`,
      t.id, accountId, t.text, Math.floor(Date.parse(t.created_at) / 1000), classify(t),
      p.impression_count ?? np.impression_count ?? 0, p.like_count || 0, p.reply_count || 0, p.retweet_count || 0,
      p.quote_count || 0, p.bookmark_count || 0, np.url_link_clicks || 0, np.user_profile_clicks || 0, now());
    n++;
  }
  return { synced: n, followers: pm.followers_count };
}

export async function analytics(db, accountId, days = 30) {
  const since = now() - days * 86400;
  const rows = await db.all('SELECT * FROM metrics WHERE account_id=? AND created_at>=? ORDER BY created_at', accountId, since);
  const sum = (k) => rows.reduce((a, r) => a + (r[k] || 0), 0);
  const eng = (r) => r.likes + r.replies + r.reposts + r.quotes + r.bookmarks;
  const group = (keyFn, label) => {
    const m = {};
    for (const r of rows) {
      const k = keyFn(r); const o = m[k] ||= { [label]: k, posts: 0, impressions: 0, engagements: 0 };
      o.posts++; o.impressions += r.impressions; o.engagements += eng(r);
    }
    return Object.values(m);
  };
  const snaps = await db.all('SELECT day,followers,following FROM follower_snaps WHERE account_id=? AND day>=? ORDER BY day',
    accountId, new Date(since * 1000).toISOString().slice(0, 10));
  const impressions = sum('impressions'), engagements = rows.reduce((a, r) => a + eng(r), 0);
  const gained = snaps.length > 1 ? snaps.at(-1).followers - snaps[0].followers : 0;
  const heat = await bestTimes(db, accountId);
  return {
    days, posts: rows.length, impressions, engagements,
    engagementRate: impressions ? +(engagements / impressions * 100).toFixed(2) : 0,
    likes: sum('likes'), replies: sum('replies'), reposts: sum('reposts'), bookmarks: sum('bookmarks'),
    linkClicks: sum('link_clicks'), profileClicks: sum('profile_clicks'),
    followersGained: gained, followersPer1kImpressions: impressions ? +(gained / impressions * 1000).toFixed(2) : 0,
    daily: group((r) => new Date(r.created_at * 1000).toISOString().slice(0, 10), 'day'),
    byType: group((r) => r.type, 'type'), followerSeries: snaps,
    top: [...rows].sort((a, b) => eng(b) - eng(a)).slice(0, 10),
    bestTimes: heat.slice(0, 10), heatmap: heat,
  };
}

/* ---------- Automations ---------- */

export async function runAutomations(db) {
  const autos = await db.all('SELECT * FROM automations WHERE enabled=1');
  const log = (a, id, act, detail = '') => db.run('INSERT OR IGNORE INTO auto_log(automation_id,x_post_id,action,detail) VALUES(?,?,?,?)', a.id, id, act, detail);
  const done = async (a, id, act) => !!(await db.get('SELECT 1 x FROM auto_log WHERE automation_id=? AND x_post_id=? AND action=?', a.id, id, act));
  for (const a of autos) {
    const cfg = J(a.config, {});
    try {
      const client = await clientFor(db, a.account_id);
      const posts = await db.all("SELECT * FROM metrics WHERE account_id=? AND type != 'reply' ORDER BY created_at DESC LIMIT 100", a.account_id);
      for (const p of posts) {
        const age = now() - p.created_at;
        if (a.type === 'retweet') {
          const h = (cfg.afterHours ?? 24) * 3600;
          if (age >= h && age < h + 172800 && p.likes >= (cfg.minLikes ?? 0) && !(await done(a, p.x_post_id, 'retweet'))) {
            await client.repost(p.x_post_id); await log(a, p.x_post_id, 'retweet');
          }
        } else if (a.type === 'plug') {
          if (cfg.text && p.likes >= (cfg.likeThreshold ?? 50) && age < 259200 && !(await done(a, p.x_post_id, 'plug'))) {
            await client.createPost({ text: cfg.text, replyTo: p.x_post_id }); await log(a, p.x_post_id, 'plug', cfg.text);
          }
        } else if (a.type === 'delete') {
          const engagement = p.likes + p.reposts + p.replies + p.quotes;
          if (age >= (cfg.afterHours ?? 48) * 3600 && age < 30 * 86400 && engagement <= (cfg.maxEngagement ?? 0) && !(await done(a, p.x_post_id, 'delete'))) {
            if (cfg.dryRun) { await log(a, p.x_post_id, 'delete', 'dry-run'); continue; }
            await client.deletePost(p.x_post_id);
            await db.run('DELETE FROM metrics WHERE x_post_id=?', p.x_post_id); await log(a, p.x_post_id, 'delete');
          }
        } else if (a.type === 'dm') {
          if (cfg.text && p.replies > 0 && age < 259200) {
            const m = await client.search(`conversation_id:${p.x_post_id}`, 20).catch(() => ({ data: [] }));
            for (const t of m.data || []) {
              if (t.author_id === client.acc.x_user_id || (await done(a, t.author_id, 'dm'))) continue;
              if (cfg.keyword && !t.text.toLowerCase().includes(cfg.keyword.toLowerCase())) continue;
              await client.sendDm(t.author_id, cfg.text); await log(a, t.author_id, 'dm', t.text.slice(0, 80));
            }
          }
        }
      }
    } catch (e) { await log(a, 'error-' + now(), 'error', e.message.slice(0, 300)); }
  }
}

/* ---------- Signal agents (lead gen) ---------- */

export async function runAgents(db, onlyId) {
  const agents = onlyId ? await db.all('SELECT * FROM agents WHERE id=?', onlyId) : await db.all('SELECT * FROM agents WHERE enabled=1 AND last_run<?', now() - 900);
  const voice = await kvGet(db, 'voice', '');
  let found = 0;
  for (const ag of agents) {
    const client = await clientFor(db, ag.account_id);
    const r = await client.search(`${ag.query} -is:retweet -is:reply lang:en`, 100);
    const users = new Map((r.includes?.users || []).map((u) => [u.id, u]));
    for (const t of r.data || []) {
      const u = users.get(t.author_id);
      if (!u || (u.public_metrics?.followers_count || 0) < ag.min_followers) continue;
      const ins = await db.run('INSERT OR IGNORE INTO leads(agent_id,x_user_id,username,name,followers,x_post_id,text) VALUES(?,?,?,?,?,?,?)',
        ag.id, u.id, u.username, u.name, u.public_metrics?.followers_count || 0, t.id, t.text);
      if (!ins.changes) continue;
      found++;
      if (ag.auto_dm) {
        try {
          const msg = await ai.dm(db, { lead: { username: u.username, name: u.name, bio: u.description, post: t.text }, template: ag.auto_dm, voice }).catch(() => ag.auto_dm);
          await client.sendDm(u.id, msg);
          await db.run('UPDATE leads SET dm_sent=1 WHERE agent_id=? AND x_user_id=?', ag.id, u.id);
        } catch {}
      }
    }
    await db.run('UPDATE agents SET last_run=? WHERE id=?', now(), ag.id);
  }
  return found;
}

/* ---------- Cron dispatcher (called every minute by Cloudflare Cron Trigger / local interval) ---------- */

export async function cronTick(db, date = new Date()) {
  const m = date.getUTCMinutes();
  const out = {};
  const step = async (name, fn) => { try { out[name] = await fn(); } catch (e) { out[name] = 'error: ' + e.message; console.error(name, e.message); } };
  await step('posts', () => runDuePosts(db));
  if (m % 15 === 0) {
    await step('automations', () => runAutomations(db));
    await step('agents', () => runAgents(db));
  }
  if (m === 0) {
    await step('sync', async () => { for (const a of await db.all('SELECT id FROM accounts')) await syncAccount(db, a.id).catch((e) => console.error('sync', e.message)); });
  }
  return out;
}
