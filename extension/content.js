// NotSuperX content script for x.com: sidebar, per-post badges (ER, AI Shield), fact-check, reply ideas, save, profile overlay.
const call = (path, body, method) => new Promise((res) => chrome.runtime.sendMessage({ path, body, method }, res));
const fmt = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : String(Math.round(n ?? 0)));
const el = (t, a = {}, ...k) => { const e = Object.assign(document.createElement(t), a); e.append(...k.flat().filter((x) => x != null && x !== false)); return e; };
const parseNum = (s) => { const m = String(s || '').replace(/,/g, '').match(/([\d.]+)\s*([KMB])?/i); return m ? Math.round(parseFloat(m[1]) * ({ K: 1e3, M: 1e6, B: 1e9 }[m[2]?.toUpperCase()] || 1)) : 0; };

let accountId = null;
async function account() {
  if (accountId) return accountId;
  const { account } = await chrome.storage.sync.get('account');
  if (account) return (accountId = +account);
  const list = await call('/accounts'); return (accountId = Array.isArray(list) ? list[0]?.id : null);
}

/* ---- themes ---- */
const THEMES = { dark: ['#14141b', '#1b1b25', '#272734', '#eceef3'], dim: ['#192734', '#22303c', '#38444d', '#e7ecf0'], light: ['#ffffff', '#f0f1f7', '#e0e2ee', '#14151c'] };
async function applyTheme() {
  const { theme = 'dark' } = await chrome.storage.sync.get('theme'); const [bg, bg2, line, fg] = THEMES[theme] || THEMES.dark;
  document.documentElement.style.setProperty('--nsx-bg', bg); document.documentElement.style.setProperty('--nsx-bg2', bg2); document.documentElement.style.setProperty('--nsx-line', line); document.documentElement.style.setProperty('--nsx-fg', fg);
}
applyTheme();

/* ---- panel ---- */
const panel = el('div', { id: 'nsx-panel' }), fab = el('button', { id: 'nsx-fab', textContent: '✕', title: 'NotSuperX (Alt+N)' });
const toggle = () => { panel.classList.toggle('open'); if (panel.classList.contains('open')) refresh(); };
fab.onclick = toggle; document.body.append(panel, fab);
document.addEventListener('keydown', (e) => { if (e.altKey && e.key.toLowerCase() === 'n') toggle(); });

async function refresh() {
  const acc = await account();
  panel.replaceChildren(el('b', {}, 'NotSuperX'), el('div', {}, 'Loading…'));
  const a = await call(`/analytics?account=${acc}&days=7`);
  if (a.error) return panel.replaceChildren(el('b', {}, 'NotSuperX'), el('div', {}, a.error));
  const ta = el('textarea', { placeholder: 'Write a post…' }), out = el('div'), score = el('div', { className: 's2' });
  let t; ta.oninput = () => { clearTimeout(t); t = setTimeout(async () => { if (!ta.value.trim()) return (score.textContent = ''); const r = await call('/tools/tweet-tester', { accountId: acc, text: ta.value }); score.textContent = r.error ? '' : `Score ${r.score}/100 — ${r.verdict}. ${r.hurts[0] ? '⚠ ' + r.hurts[0] : ''}`; }, 500); };
  const send = (mode) => async () => { const r = await call('/posts', { accountId: acc, text: ta.value, mode }); out.textContent = r.error ? r.error : `✓ ${r.status}`; if (!r.error) ta.value = ''; };
  const rewrite = el('button', { textContent: '✨ Rewrite', onclick: async () => { const r = await call('/ai/rewrite', { text: ta.value }); out.replaceChildren(...(r.result || [r.error]).map((x) => el('div', { className: 'r', textContent: x, onclick: () => (ta.value = x) }))); } });
  const themeSel = el('select', { onchange: async (e) => { await chrome.storage.sync.set({ theme: e.target.value }); applyTheme(); } }, ...Object.keys(THEMES).map((k) => el('option', { value: k, textContent: k })));
  chrome.storage.sync.get('theme', ({ theme }) => { if (theme) themeSel.value = theme; });
  const matrix = el('button', { textContent: 'Who interacts with me', onclick: async () => { const m = await call(`/interactions?account=${acc}`); out.replaceChildren(...(Array.isArray(m) ? m.slice(0, 8).map((u) => el('div', { className: 'r', textContent: `@${u.username} · ${u.replies} replies · ${u.quotes} quotes · ${u.mentions} mentions` })) : [m.error])); } });
  panel.replaceChildren(el('b', {}, 'Last 7 days'), el('div', {}, ...[['Impr.', fmt(a.impressions)], ['Eng. rate', a.engagementRate + '%'], ['Followers', (a.followersGained >= 0 ? '+' : '') + a.followersGained], ['Posts', a.posts]].map(([k, v]) => el('span', { className: 's' }, k, el('b', {}, v)))),
    ta, score, el('div', {}, el('button', { textContent: 'Post now', onclick: send('now') }), el('button', { textContent: 'Queue', onclick: send('queue') }), el('button', { textContent: 'Draft', onclick: send('draft') }), rewrite, matrix), out,
    el('div', { className: 'hint' }, 'Per post: 💾 save · ✨ reply ideas · 🔍 fact-check · badges show engagement rate and AI-Shield. Theme: ', themeSel));
}

/* ---- AI shield (local heuristic mirrors server/insights.js) ---- */
function shield(text) {
  let s = 10; const why = []; const add = (c, p, r) => { if (c) { s += p; why.push(r); } };
  add(/(great|excellent|fantastic|insightful|valuable|amazing) (post|thread|insight|point|take|read)/i.test(text), 25, 'generic praise');
  add(/(thanks for sharing|thank you for sharing|love this|this resonates|so true)/i.test(text), 15, 'stock phrase');
  add(/(delve|tapestry|game-?changer|it's important to note|unlock|leverage|navigate the|in today's)/i.test(text), 20, 'machine vocabulary');
  add(/—/.test(text), 10, 'em-dash'); add(/#\w+/.test(text), 8, 'hashtag in reply'); add(text.length > 200, 8, 'long/formal');
  add(!/\d|@\w+|https?:/.test(text) && text.length > 60, 6, 'no specifics'); s = Math.min(99, s);
  return { score: s, label: s >= 60 ? 'Likely AI' : s >= 35 ? 'Possibly AI' : 'Human', why };
}

/* ---- per-post tooling ---- */
function tweetData(article) {
  const text = article.querySelector('[data-testid="tweetText"]')?.innerText || '';
  const link = [...article.querySelectorAll('a[href*="/status/"]')].find((a) => /\/status\/\d+$/.test(a.getAttribute('href')));
  const [, author, id] = link?.getAttribute('href').match(/^\/([^/]+)\/status\/(\d+)/) || [];
  const num = (tid) => parseNum(article.querySelector(`[data-testid="${tid}"]`)?.innerText);
  const views = parseNum(article.querySelector('a[href$="/analytics"]')?.innerText || '');
  return { text, author, x_post_id: id, likes: num('like') || num('unlike'), reposts: num('retweet') || num('unretweet'), replies: num('reply'), views, url: id ? `https://x.com/${author}/status/${id}` : '', source: 'extension' };
}
const showInPanel = (title, ...nodes) => { panel.classList.add('open'); panel.replaceChildren(el('b', {}, title), ...nodes); };

function decorate() {
  document.querySelectorAll('article[data-testid="tweet"]:not([data-nsx])').forEach((art) => {
    art.dataset.nsx = '1';
    const bar = art.querySelector('[role="group"]'); if (!bar) return;
    const d = tweetData(art);
    // live metrics badge
    const eng = d.likes + d.reposts + d.replies;
    if (d.views > 0) { const er = (eng / d.views) * 100; bar.append(el('span', { className: 'nsx-badge', title: `${fmt(eng)} engagements / ${fmt(d.views)} views`, textContent: `ER ${er.toFixed(1)}%${er >= 5 ? ' 🔥' : ''}` })); }
    else if (eng > 0) bar.append(el('span', { className: 'nsx-badge', textContent: `${fmt(eng)} eng.` }));
    // AI shield on replies (not the first/main tweet on a status page)
    const isReply = /\/status\/\d+/.test(location.pathname) && art.querySelector('[data-testid="tweetText"]') && !location.pathname.endsWith(d.x_post_id || '#');
    if (isReply && d.text) { const s = shield(d.text); if (s.score >= 35) bar.append(el('span', { className: 'nsx-badge ' + (s.score >= 60 ? 'bad' : ''), title: s.why.join(', '), textContent: `🛡 ${s.label}` })); }
    const btn = (txt, title, fn) => bar.append(el('button', { className: 'nsx-btn', textContent: txt, title, onclick: async (e) => { e.stopPropagation(); e.preventDefault(); await fn(e.currentTarget); } }));
    btn('💾', 'Save to NotSuperX viral library', async (b) => { const r = await call('/viral', tweetData(art)); b.textContent = r.error ? '⚠️' : '✓'; b.title = r.error || 'Saved'; });
    btn('✨', 'AI reply ideas', async (b) => { b.textContent = '…'; const t = tweetData(art); const r = await call('/ai/replies', { text: t.text, author: t.author }); b.textContent = '✨';
      showInPanel('Reply ideas for @' + t.author, ...(r.result || [r.error]).map((x) => el('div', { className: 'r', textContent: x, onclick: () => navigator.clipboard.writeText(x) })), el('div', { className: 'hint' }, 'Click to copy, then paste into the reply box.')); });
    btn('🔍', 'Fact-check this post', async (b) => { b.textContent = '…'; const r = await call('/ai-tools/factcheck', { text: tweetData(art).text }); b.textContent = '🔍'; showInPanel('Fact-check', el('div', { style: 'white-space:pre-wrap', textContent: r.result || r.error })); });
  });
}

/* ---- profile overlay for any profile ---- */
let lastProfile = '';
const RESERVED = new Set(['home', 'explore', 'notifications', 'messages', 'i', 'settings', 'compose', 'search', 'bookmarks', 'lists', 'communities', 'premium', 'jobs', 'grok', 'login', 'signup', 'tos', 'privacy']);
async function profileOverlay() {
  const m = location.pathname.match(/^\/([A-Za-z0-9_]{1,15})\/?$/); const old = document.getElementById('nsx-profile');
  if (!m || RESERVED.has(m[1].toLowerCase())) { old?.remove(); lastProfile = ''; return; }
  if (lastProfile === m[1]) return; lastProfile = m[1]; old?.remove();
  const acc = await account(); const box = el('div', { id: 'nsx-profile' }, el('b', {}, '✕ NotSuperX · @' + m[1]), el('div', { className: 'hint' }, 'Loading profile intelligence…')); document.body.append(box);
  const r = await call(`/profile?account=${acc}&username=${m[1]}`);
  if (r.error) return box.replaceChildren(el('b', {}, '@' + m[1]), el('div', { className: 'hint' }, r.error));
  const chatOut = el('div'), chatIn = el('input', { placeholder: 'Ask about this profile…', onkeydown: async (e) => { if (e.key !== 'Enter') return; const q = chatIn.value; chatIn.value = ''; chatOut.textContent = '…'; const c = await call('/profile/chat', { accountId: acc, username: m[1], question: q }); chatOut.textContent = c.result || c.error; } });
  box.replaceChildren(el('div', { style: 'display:flex;justify-content:space-between' }, el('b', {}, '@' + m[1]), el('span', { style: 'cursor:pointer', textContent: '–', onclick: () => box.classList.toggle('min') })),
    el('div', {}, ...[['Health', r.health.score + '/100'], ['Type', r.archetype], ['Median views', fmt(r.metrics.views.median)], ['≈ per sponsored post', '$' + fmt(r.estimatedEarnings.perSponsoredPost)]].map(([k, v]) => el('span', { className: 's' }, k, el('b', {}, v)))),
    el('div', { className: 'hint' }, r.health.band + ' · ' + (r.health.recommendations[0] || '')),
    el('b', {}, 'Best posts'), ...r.topPosts.slice(0, 3).map((t) => el('div', { className: 'r', textContent: `${fmt(t.like_count)}♥ ${t.text.slice(0, 110)}` })),
    el('div', {}, el('button', { textContent: '+ Engage target', onclick: async (e) => { await call('/engage/targets', { accountId: acc, username: m[1] }); e.target.textContent = '✓ added'; } })), chatIn, chatOut);
}

const tick = () => { decorate(); profileOverlay(); };
new MutationObserver(tick).observe(document.body, { childList: true, subtree: true }); tick();
setInterval(profileOverlay, 1500);
