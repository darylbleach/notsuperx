// Mock X API v2 + OAuth + Anthropic + Bluesky for local testing with dummy content.
// node mock/mock-x.js  -> http://localhost:9000  (X at /2, Anthropic at /v1/messages, Bluesky at /xrpc)
import http from 'node:http';

let seed = 7; const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const now = () => Date.now();

const NAMES = ['ada', 'grace', 'linus', 'margaret', 'alan', 'tim', 'radia', 'guido', 'barbara', 'ken', 'dennis', 'anita'];
const TOPICS = ['saas pricing', 'indie hacking', 'AI agents', 'cold email', 'growth loops', 'founder mental health', 'shipping fast', 'distribution'];
const HOOKS = ['I studied 100 startups.', 'Unpopular opinion:', 'Most founders get this wrong:', 'Here is what nobody tells you about', 'I made $10k in 30 days with', 'Stop doing this if you want to grow:', 'The 3 rules I follow for', 'Hot take:'];

export const state = { users: new Map(), tweets: [], dms: [], nextId: 1000, calls: [], bsky: [] };
const mkUser = (i, username, followers) => ({ id: String(100 + i), username, name: username[0].toUpperCase() + username.slice(1), profile_image_url: `https://api.dicebear.com/7.x/thumbs/svg?seed=${username}`, description: `Building things about ${pick(TOPICS)}.`, created_at: '2020-01-01T00:00:00.000Z', public_metrics: { followers_count: followers, following_count: 300 + i * 10, tweet_count: 1500, listed_count: 12 } });

export function seedData() {
  state.users.clear(); state.tweets.length = 0; seed = 7;
  const me = mkUser(0, 'demo', 4200); me.id = '1'; state.users.set('1', me);
  NAMES.forEach((n, i) => state.users.set(String(100 + i), mkUser(i, n, Math.floor(500 + rnd() * 90000))));
  for (const u of state.users.values()) {
    const n = u.id === '1' ? 90 : 25;
    for (let i = 0; i < n; i++) {
      const ageH = rnd() * 24 * 30; const viral = rnd() < 0.08 ? 8 : 1;
      const base = Math.floor((u.public_metrics.followers_count / 20) * (0.3 + rnd()) * viral);
      const hasMedia = rnd() < 0.25, hasLink = rnd() < 0.15, isReply = rnd() < 0.15;
      const text = `${pick(HOOKS)} ${pick(TOPICS)}${hasLink ? ' https://example.com/post' : ''}${rnd() < 0.2 ? ' 🚀' : ''}${rnd() < 0.1 ? ' #buildinpublic' : ''}\n\nLine ${i}: ${pick(TOPICS)} matters.`;
      const like = Math.floor(base * (0.02 + rnd() * 0.05));
      state.tweets.push({
        id: String(state.nextId++), author_id: u.id, text, created_at: new Date(now() - ageH * 36e5).toISOString(),
        referenced_tweets: isReply ? [{ type: 'replied_to', id: '1' }] : undefined,
        attachments: hasMedia ? { media_keys: ['m1'] } : undefined,
        entities: hasLink ? { urls: [{ expanded_url: 'https://example.com/post' }] } : undefined,
        public_metrics: { impression_count: base, like_count: like, retweet_count: Math.floor(like * 0.15), reply_count: Math.floor(like * 0.1), quote_count: Math.floor(like * 0.03), bookmark_count: Math.floor(like * 0.2) },
        non_public_metrics: { impression_count: base, url_link_clicks: hasLink ? Math.floor(base * 0.01) : 0, user_profile_clicks: Math.floor(base * 0.004) },
        conversation_id: undefined,
      });
    }
  }
  // mentions of me
  for (let i = 0; i < 8; i++) {
    const u = state.users.get(String(100 + (i % NAMES.length)));
    state.tweets.push({ id: String(state.nextId++), author_id: u.id, text: `@demo ${pick(['great thread!', 'how do you price this?', 'interested — DM me the link', 'disagree, here is why…'])}`, created_at: new Date(now() - rnd() * 48 * 36e5).toISOString(), public_metrics: { impression_count: 100, like_count: 2, retweet_count: 0, reply_count: 0, quote_count: i % 3 === 0 ? 1 : 0, bookmark_count: 0 }, referenced_tweets: i % 3 === 0 ? [{ type: 'quoted', id: '1' }] : [{ type: 'replied_to', id: state.tweets.find((t) => t.author_id === '1')?.id }], mention: true });
  }
  // intent-signal posts for Signal Agents
  for (let i = 0; i < 6; i++) {
    const u = state.users.get(String(100 + i));
    state.tweets.push({ id: String(state.nextId++), author_id: u.id, text: `Looking for a good CRM for my small team, any recommendations? #${i}`, created_at: new Date(now() - rnd() * 6 * 36e5).toISOString(), public_metrics: { impression_count: 900, like_count: 30 + i, retweet_count: 2, reply_count: 5, quote_count: 0, bookmark_count: 1 } });
  }
}
seedData();

const json = (res, data, status = 200) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(data)); };
const withFields = (t, q) => {
  const f = (q.get('tweet.fields') || '').split(',');
  const o = { id: t.id, text: t.text, author_id: t.author_id, conversation_id: t.conversation_id || t.id };
  if (f.includes('created_at')) o.created_at = t.created_at;
  if (f.includes('public_metrics')) o.public_metrics = t.public_metrics;
  if (f.includes('non_public_metrics') && t.author_id === '1') o.non_public_metrics = t.non_public_metrics;
  if (f.includes('referenced_tweets') && t.referenced_tweets) o.referenced_tweets = t.referenced_tweets;
  if (f.includes('attachments') && t.attachments) o.attachments = t.attachments;
  if (f.includes('entities') && t.entities) o.entities = t.entities;
  return o;
};
const inc = (list) => ({ users: [...new Set(list.map((t) => t.author_id))].map((id) => state.users.get(id)).filter(Boolean) });

function search(q) {
  const query = q.get('query') || '';
  let list = state.tweets;
  const from = query.match(/from:(\w+)/)?.[1]; if (from) list = list.filter((t) => state.users.get(t.author_id)?.username === from);
  const conv = query.match(/conversation_id:(\d+)/)?.[1]; if (conv) list = list.filter((t) => t.referenced_tweets?.some((r) => r.id === conv));
  const words = query.replace(/\(|\)|-is:\w+|lang:\w+|from:\w+|conversation_id:\d+|\bOR\b|is:\w+/g, ' ').replace(/"/g, '').split(/\s+/).filter(Boolean);
  if (words.length && !from && !conv) list = list.filter((t) => words.some((w) => t.text.toLowerCase().includes(w.toLowerCase())));
  if (/-is:reply/.test(query)) list = list.filter((t) => !t.referenced_tweets?.some((r) => r.type === 'replied_to'));
  return list.slice().sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, +q.get('max_results') || 20);
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x'); const q = u.searchParams; const p = u.pathname;
  const body = await new Promise((r) => { const c = []; req.on('data', (d) => c.push(d)); req.on('end', () => r(Buffer.concat(c))); });
  state.calls.push(`${req.method} ${p}`);
  const j = () => { try { return JSON.parse(body.toString() || '{}'); } catch { return {}; } };

  // OAuth: fake consent page that redirects straight back
  if (p === '/authorize') { const r = new URL(q.get('redirect_uri')); r.searchParams.set('code', 'mockcode'); r.searchParams.set('state', q.get('state')); res.writeHead(302, { location: r.toString() }); return res.end(); }
  if (p === '/2/oauth2/token') return json(res, { access_token: 'mock-access-' + Math.random().toString(36).slice(2), refresh_token: 'mock-refresh', expires_in: 7200, token_type: 'bearer' });

  // Anthropic
  if (p === '/v1/messages') {
    const b = j(); const prompt = b.messages?.[0]?.content || '';
    let text;
    if (/JSON array/i.test(prompt) || /JSON array/i.test(b.system || '')) text = JSON.stringify([1, 2, 3].map((i) => `Mock AI post ${i}: ${prompt.slice(0, 60).replace(/\n/g, ' ')}`));
    else if (/SVG/.test(b.system || '')) text = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1500 500"><rect width="1500" height="500" fill="#345"/><text x="60" y="260" fill="#fff" font-size="60">Mock cover</text></svg>';
    else if (/AI-generated|ai shield/i.test(b.system || '')) text = '{"score":42,"reason":"mock"}';
    else text = `# Mock AI output\n\n${prompt.slice(0, 120)}`;
    return json(res, { content: [{ type: 'text', text }], usage: { input_tokens: 50, output_tokens: 80 } });
  }

  // Bluesky
  if (p === '/xrpc/com.atproto.server.createSession') return json(res, { accessJwt: 'jwt', did: 'did:plc:mock' });
  if (p === '/xrpc/com.atproto.repo.createRecord') { state.bsky.push(j().record.text); return json(res, { uri: 'at://mock/' + state.bsky.length, cid: 'cid' + state.bsky.length }); }

  if (!p.startsWith('/2/')) { res.writeHead(404); return res.end(); }
  const path = p.slice(2); let m;

  if (path === '/users/me') return json(res, { data: state.users.get('1') });
  if ((m = path.match(/^\/users\/by\/username\/(\w+)$/))) { const us = [...state.users.values()].find((x) => x.username.toLowerCase() === m[1].toLowerCase()); return us ? json(res, { data: us }) : json(res, { errors: [{ detail: 'not found' }], title: 'Not Found' }, 404); }
  if ((m = path.match(/^\/users\/(\d+)\/tweets$/))) {
    let list = state.tweets.filter((t) => t.author_id === m[1] && !t.mention);
    if ((q.get('exclude') || '').includes('replies')) list = list.filter((t) => !t.referenced_tweets);
    list = list.sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, +q.get('max_results') || 10);
    return json(res, { data: list.map((t) => withFields(t, q)) });
  }
  if ((m = path.match(/^\/users\/(\d+)\/mentions$/))) { const l = state.tweets.filter((t) => t.mention).sort((a, b) => b.created_at.localeCompare(a.created_at)); return json(res, { data: l.map((t) => withFields(t, q)), includes: inc(l) }); }
  if ((m = path.match(/^\/users\/(\d+)\/(retweets|likes)$/))) return req.method === 'POST' ? json(res, { data: { retweeted: true, liked: true } }) : json(res, { data: { retweeted: false } });
  if (path === '/tweets/search/recent') { const l = search(q); return json(res, { data: l.map((t) => withFields(t, q)), includes: inc(l) }); }
  if (path === '/tweets' && req.method === 'POST') {
    const b = j(); const t = { id: String(state.nextId++), author_id: '1', text: b.text, created_at: new Date().toISOString(), public_metrics: { impression_count: 0, like_count: 0, retweet_count: 0, reply_count: 0, quote_count: 0, bookmark_count: 0 }, non_public_metrics: { impression_count: 0 }, referenced_tweets: b.reply ? [{ type: 'replied_to', id: b.reply.in_reply_to_tweet_id }] : undefined, media: b.media };
    state.tweets.push(t); return json(res, { data: { id: t.id, text: t.text } }, 201);
  }
  if ((m = path.match(/^\/tweets\/(\d+)$/))) {
    const i = state.tweets.findIndex((t) => t.id === m[1]);
    if (req.method === 'DELETE') { if (i >= 0) state.tweets.splice(i, 1); return json(res, { data: { deleted: i >= 0 } }); }
    if (i < 0) return json(res, { title: 'Not Found', detail: 'no tweet' }, 404);
    const t = state.tweets[i]; return json(res, { data: withFields(t, q), includes: { ...inc([t]), media: t.attachments ? [{ media_key: 'm1', type: 'video', variants: [{ content_type: 'video/mp4', bit_rate: 832000, url: 'https://example.com/v_low.mp4' }, { content_type: 'video/mp4', bit_rate: 2176000, url: 'https://example.com/v_high.mp4' }], preview_image_url: 'https://example.com/p.jpg' }] : [] } });
  }
  if ((m = path.match(/^\/dm_conversations\/with\/(\d+)\/messages$/))) { state.dms.push({ to: m[1], text: j().text }); return json(res, { data: { dm_conversation_id: 'c1', dm_event_id: 'e' + state.dms.length } }, 201); }
  if (path === '/media/upload') return json(res, { data: { id: 'media-' + Date.now() } });
  if ((m = path.match(/^\/trends\/by\/woeid\/(\d+)$/))) return json(res, { data: TOPICS.map((t, i) => ({ trend_name: t, post_count: 90000 - i * 7000 })) });
  json(res, { title: 'Not Implemented', detail: path }, 501);
});

export function startMock(port = 9000) { return new Promise((r) => server.listen(port, () => r(server))); }
if (import.meta.url === `file://${process.argv[1]}`) { await startMock(+process.env.MOCK_PORT || 9000); console.log('mock X/Anthropic/Bluesky on :' + (process.env.MOCK_PORT || 9000)); }
