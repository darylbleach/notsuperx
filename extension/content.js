const call = (path, body, method) => new Promise((res) => chrome.runtime.sendMessage({ path, body, method }, res));
const fmt = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : String(n ?? 0));
const el = (t, a = {}, ...k) => { const e = Object.assign(document.createElement(t), a); e.append(...k); return e; };

let accountId = null;
async function account() {
  if (accountId) return accountId;
  const { account } = await chrome.storage.sync.get('account');
  if (account) return (accountId = +account);
  const list = await call('/accounts'); return (accountId = Array.isArray(list) ? list[0]?.id : null);
}

/* ---- panel ---- */
const panel = el('div', { id: 'nsx-panel' }), fab = el('button', { id: 'nsx-fab', textContent: '✕', title: 'NotSuperX' });
fab.onclick = () => { panel.classList.toggle('open'); if (panel.classList.contains('open')) refresh(); };
document.body.append(panel, fab);

async function refresh() {
  const acc = await account();
  panel.replaceChildren(el('b', {}, 'NotSuperX'), el('div', {}, 'Loading…'));
  const a = await call(`/analytics?account=${acc}&days=7`);
  if (a.error) return panel.replaceChildren(el('b', {}, 'NotSuperX'), el('div', {}, a.error));
  const ta = el('textarea', { placeholder: 'Write a post…' }), out = el('div');
  const send = (mode) => async () => { const r = await call('/posts', { accountId: acc, text: ta.value, mode }); out.textContent = r.error ? r.error : `✓ ${r.status}`; if (!r.error) ta.value = ''; };
  const ideas = el('button', { textContent: '✨ Rewrite' });
  ideas.onclick = async () => { const r = await call('/ai/rewrite', { text: ta.value }); out.replaceChildren(...(r.result || [r.error]).map((t) => el('div', { className: 'r', textContent: t, onclick: () => (ta.value = t) }))); };
  panel.replaceChildren(el('b', {}, 'Last 7 days'), el('div', {},
    ...[['Impr.', fmt(a.impressions)], ['Eng. rate', a.engagementRate + '%'], ['Followers', (a.followersGained >= 0 ? '+' : '') + a.followersGained], ['Posts', a.posts]].map(([k, v]) => el('span', { className: 's' }, k, el('b', {}, v)))),
    ta, el('div', {}, el('button', { textContent: 'Post now', onclick: send('now') }), el('button', { textContent: 'Queue', onclick: send('queue') }), el('button', { textContent: 'Draft', onclick: send('draft') }), ideas), out,
    el('div', { style: 'margin-top:8px;color:#8b8fa3' }, 'Buttons on each post: 💾 save to viral library · ✨ reply ideas.'));
}

/* ---- per-post buttons ---- */
function tweetData(article) {
  const text = article.querySelector('[data-testid="tweetText"]')?.innerText || '';
  const link = [...article.querySelectorAll('a[href*="/status/"]')].find((a) => /\/status\/\d+$/.test(a.getAttribute('href')));
  const [, author, id] = link?.getAttribute('href').match(/^\/([^/]+)\/status\/(\d+)/) || [];
  const num = (tid) => { const t = article.querySelector(`[data-testid="${tid}"]`)?.innerText || '0'; const m = t.match(/([\d.]+)\s*([KM])?/i); return m ? Math.round(parseFloat(m[1]) * ({ K: 1e3, M: 1e6 }[m[2]?.toUpperCase()] || 1)) : 0; };
  return { text, author, x_post_id: id, likes: num('like') || num('unlike'), reposts: num('retweet'), replies: num('reply'), url: id ? `https://x.com/${author}/status/${id}` : '', source: 'extension' };
}
function decorate() {
  document.querySelectorAll('article[data-testid="tweet"]:not([data-nsx])').forEach((art) => {
    art.dataset.nsx = '1';
    const bar = art.querySelector('[role="group"]'); if (!bar) return;
    const save = el('button', { className: 'nsx-btn', textContent: '💾', title: 'Save to NotSuperX viral library' });
    save.onclick = async (e) => { e.stopPropagation(); const r = await call('/viral', tweetData(art)); save.textContent = r.error ? '⚠️' : '✓'; save.title = r.error || 'Saved'; };
    const reply = el('button', { className: 'nsx-btn', textContent: '✨', title: 'AI reply ideas' });
    reply.onclick = async (e) => {
      e.stopPropagation(); reply.textContent = '…'; const t = tweetData(art);
      const r = await call('/ai/replies', { text: t.text, author: t.author }); reply.textContent = '✨';
      panel.classList.add('open');
      panel.replaceChildren(el('b', {}, 'Reply ideas for @' + t.author), ...(r.result || [r.error]).map((x) => el('div', { className: 'r', textContent: x, onclick: () => { navigator.clipboard.writeText(x); } }, )), el('div', { style: 'color:#8b8fa3;margin-top:6px' }, 'Click to copy, then paste into the reply box.'));
    };
    bar.append(save, reply);
  });
}
new MutationObserver(decorate).observe(document.body, { childList: true, subtree: true }); decorate();
