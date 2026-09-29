import { h, api, toast, fmt, state, copy, composer, xLen, DOW } from './lib.js';

const bold = (t, off) => [...t].map((c) => { const k = c.codePointAt(0); return k >= 65 && k <= 90 ? String.fromCodePoint(off + k - 65) : k >= 97 && k <= 122 ? String.fromCodePoint(off + 26 + k - 97) : k >= 48 && k <= 57 && off === 0x1d5d4 ? String.fromCodePoint(0x1d7ec + k - 48) : c; }).join('');
const TEMPLATES = [
  ['Hook → list', 'I studied [X] for [time].\n\nHere are [N] lessons nobody tells you:\n\n1. \n2. \n3. '],
  ['Contrarian', 'Unpopular opinion:\n\n[Common belief] is wrong.\n\nHere\'s why: '],
  ['Before/After', 'Before: [painful state]\nAfter: [desired state]\n\nWhat changed: [one thing]'],
  ['Story', '[Time] ago I [failure].\n\nToday I [result].\n\nThe difference:\n\n1. \n2. \n3. '],
  ['Framework', 'The [Name] framework:\n\n[Step 1] → \n[Step 2] → \n[Step 3] → \n\nSave this.'],
  ['Question', '[Provocative question]?\n\nMy answer: '],
  ['Milestone', '[Number] [metric] in [time].\n\nWhat worked:\n\n• \n• \n• \n\nWhat didn\'t: '],
];

function canvasTool(kind) {
  const f = { name: h('input', { value: 'Ada Lovelace' }), user: h('input', { value: 'ada' }), text: h('textarea', {}, 'Just shipped my own X growth tool.\n\nSaved $50/month.'), likes: h('input', { value: '1.2K' }), theme: h('select', {}, h('option', { value: 'dark' }, 'Dark'), h('option', { value: 'light' }, 'Light')), bg: h('input', { type: 'color', value: '#6d8bff' }) };
  const cv = h('canvas', { width: 1200, height: 675 });
  const draw = () => {
    const c = cv.getContext('2d'); const dark = f.theme.value === 'dark';
    const g = c.createLinearGradient(0, 0, 1200, 675); g.addColorStop(0, f.bg.value); g.addColorStop(1, '#8a5cff'); c.fillStyle = g; c.fillRect(0, 0, 1200, 675);
    c.fillStyle = dark ? '#0f1116' : '#fff'; c.beginPath(); c.roundRect(100, 80, 1000, 515, 28); c.fill();
    c.fillStyle = f.bg.value; c.beginPath(); c.arc(170, 160, 34, 0, 7); c.fill();
    c.fillStyle = dark ? '#fff' : '#0f1419'; c.font = 'bold 30px system-ui'; c.fillText(f.name.value, 225, 155);
    c.fillStyle = '#8b98a5'; c.font = '26px system-ui'; c.fillText('@' + f.user.value, 225, 190);
    c.fillStyle = dark ? '#e7e9ea' : '#0f1419'; c.font = '38px system-ui';
    let y = 265; for (const para of f.text.value.split('\n')) { let line = ''; for (const w of para.split(' ')) { if (c.measureText(line + ' ' + w).width > 900) { c.fillText(line, 140, y); y += 50; line = w; } else line = (line + ' ' + w).trim(); } c.fillText(line, 140, y); y += 50; }
    c.fillStyle = '#8b98a5'; c.font = '26px system-ui'; c.fillText(`♥ ${f.likes.value}    ⟲    💬    ↗`, 140, 555);
  };
  Object.values(f).forEach((e) => e.addEventListener('input', draw)); setTimeout(draw, 0);
  return h('div', {}, h('div', { class: 'grid g2' }, h('div', {}, ...Object.entries(f).flatMap(([k, e]) => [h('label', {}, k), e])), h('div', {}, cv)),
    h('button', { style: 'margin-top:10px', onclick: () => { const a = h('a', { download: 'tweet.png', href: cv.toDataURL('image/png') }); a.click(); } }, 'Download PNG'));
}

function banner() {
  const title = h('input', { value: 'Building in public' }), sub = h('input', { value: 'SaaS · AI · Growth' }), c1 = h('input', { type: 'color', value: '#111827' }), c2 = h('input', { type: 'color', value: '#6d8bff' });
  const cv = h('canvas', { width: 1500, height: 500 });
  const draw = () => { const c = cv.getContext('2d'); const g = c.createLinearGradient(0, 0, 1500, 500); g.addColorStop(0, c1.value); g.addColorStop(1, c2.value); c.fillStyle = g; c.fillRect(0, 0, 1500, 500);
    c.fillStyle = 'rgba(255,255,255,.06)'; for (let i = 0; i < 12; i++) { c.beginPath(); c.arc(200 + i * 120, 250 + Math.sin(i) * 120, 90, 0, 7); c.fill(); }
    c.fillStyle = '#fff'; c.font = 'bold 84px system-ui'; c.fillText(title.value, 480, 250); c.font = '40px system-ui'; c.globalAlpha = .8; c.fillText(sub.value, 480, 315); c.globalAlpha = 1; };
  [title, sub, c1, c2].forEach((e) => e.addEventListener('input', draw)); setTimeout(draw, 0);
  return h('div', {}, h('div', { class: 'row' }, title, sub, c1, c2), h('p', { class: 'mute' }, 'Keep key content right of x≈480 — the avatar covers the left on desktop.'), cv,
    h('div', {}, h('button', { onclick: () => h('a', { download: 'banner.png', href: cv.toDataURL() }).click() }, 'Download 1500×500')));
}

const apiTool = (fields, path, render) => {
  const inputs = fields.map(([k, ph]) => h('input', { placeholder: ph, id: 't_' + k })); const out = h('div', { style: 'margin-top:12px' });
  return h('div', {}, h('div', { class: 'row' }, inputs, h('button', { onclick: async (e) => {
    e.target.disabled = true; out.textContent = 'Working…';
    try { const q = new URLSearchParams({ account: state.account, ...Object.fromEntries(fields.map(([k], i) => [k, inputs[i].value.replace(/^@/, '')])) }); out.replaceChildren(await render(await api(`${path}?${q}`))); }
    catch (x) { out.replaceChildren(h('span', { style: 'color:var(--bad)' }, x.message)); } e.target.disabled = false; } }, 'Run')), out);
};

const TOOLS = {
  'Character counter': () => { const c = composer(''); return h('div', {}, c.el, h('p', { class: 'mute' }, 'URLs count as 23 chars. Over 280? Use Compose to auto-thread.')); },
  'Thread splitter': () => { const ta = h('textarea', {}); const out = h('div', {}); ta.addEventListener('input', () => { const parts = ta.value.length <= 280 ? [ta.value] : (() => { const p = []; let cur = ''; for (const w of ta.value.split(/(\s+)/)) { if ((cur + w).length > 270) { p.push(cur.trim()); cur = w.trimStart(); } else cur += w; } if (cur.trim()) p.push(cur.trim()); return p; })(); out.replaceChildren(...parts.map((t, i) => h('div', { class: 'post' }, `${t}${parts.length > 1 ? ` (${i + 1}/${parts.length})` : ''}`))); }); return h('div', {}, ta, out); },
  'Tweet → image': () => canvasTool('img'),
  'Fake tweet maker': () => canvasTool('fake'),
  'Banner maker': banner,
  'LinkedIn formatter': () => { const ta = h('textarea', { placeholder: 'Type text…' }); const out = h('pre', {}); const up = (off) => () => { out.textContent = bold(ta.value, off); }; return h('div', {}, ta, h('div', { class: 'row', style: 'margin:8px 0' }, h('button', { class: 'ghost', onclick: up(0x1d5d4) }, '𝗕𝗼𝗹𝗱'), h('button', { class: 'ghost', onclick: () => { out.textContent = [...ta.value].map((c) => { const k = c.charCodeAt(0); return k >= 65 && k <= 90 ? String.fromCodePoint(0x1d608 + k - 65) : k >= 97 && k <= 122 ? String.fromCodePoint(0x1d622 + k - 97) : c; }).join(''); } }, '𝘐𝘵𝘢𝘭𝘪𝘤'), h('button', { onclick: () => copy(out.textContent) }, 'Copy')), out); },
  'Post templates': () => h('div', {}, TEMPLATES.map(([n, t]) => h('div', { class: 'post' }, h('b', {}, n), '\n' + t, h('div', { class: 'row', style: 'margin-top:8px' }, h('button', { class: 'ghost', onclick: () => copy(t) }, 'Copy'), h('button', { class: 'ghost', onclick: () => { sessionStorage.setItem('draft', JSON.stringify({ text: t })); location.hash = '#/compose'; } }, 'Use'))))),
  'Engagement calculator': () => { const i = ['Impressions', 'Likes', 'Replies', 'Reposts', 'Bookmarks', 'Followers'].map((p) => h('input', { type: 'number', placeholder: p })); const out = h('div', { class: 'stat' }); const go = () => { const [imp, l, r, rp, b, f] = i.map((x) => +x.value || 0); out.replaceChildren(h('small', {}, 'Engagement rate'), h('b', {}, imp ? ((l + r + rp + b) / imp * 100).toFixed(2) + '%' : '—'), h('small', {}, f ? `Reach ratio: ${(imp / f * 100).toFixed(0)}% of followers` : '')); }; i.forEach((x) => x.addEventListener('input', go)); return h('div', {}, h('div', { class: 'row' }, i), h('div', { style: 'height:10px' }), out); },
  'Account valuation': () => { const f = h('input', { type: 'number', placeholder: 'Followers' }), e = h('input', { type: 'number', placeholder: 'Avg engagement rate %' }), n = h('select', {}, ['General', 'Tech/SaaS', 'Finance/Crypto', 'Lifestyle'].map((x, i) => h('option', { value: [0.5, 1.2, 1.5, 0.8][i] }, x))); const out = h('div', { class: 'stat' }); const go = () => { const v = (+f.value || 0) * (0.02 + (+e.value || 0) * 0.02) * +n.value * 10; out.replaceChildren(h('small', {}, 'Rough value (heuristic)'), h('b', {}, '$' + fmt(Math.round(v)))); }; [f, e, n].forEach((x) => x.addEventListener('input', go)); return h('div', {}, h('div', { class: 'row' }, f, e, n), h('div', { style: 'height:10px' }), out); },
  'Bio generator': () => { const a = h('textarea', { placeholder: 'Who are you / what do you do?' }); const out = h('div', {}); return h('div', {}, a, h('button', { onclick: async () => { try { out.replaceChildren(...(await api('/ai/bio', { body: { about: a.value } })).result.map((t) => h('div', { class: 'post' }, t, h('button', { class: 'ghost', onclick: () => copy(t) }, 'Copy')))); } catch (e) { toast(e.message, true); } } }, 'Generate'), out); },
  'Growth roadmap': () => { const g = h('input', { placeholder: 'Goal, e.g. 10k followers in 90 days' }); const out = h('pre', {}); return h('div', {}, g, h('button', { onclick: async () => { try { out.textContent = 'Thinking…'; out.textContent = (await api('/ai/roadmap', { body: { goal: g.value, followers: state.accounts.find((a) => a.id === state.account)?.followers } })).result; } catch (e) { out.textContent = e.message; } } }, 'Generate'), out); },
  'Optimal post time': async () => { const a = await api(`/analytics/audience?account=${state.account}`); return h('div', {}, a.best.length ? a.best.map((b) => h('div', { class: 'post' }, `${DOW[b.dow]} ${String(b.hour).padStart(2, '0')}:00 UTC — avg weighted engagement ${b.score.toFixed(1)} over ${b.n} posts`)) : 'Sync analytics first.'); },
  'Profile audit': () => apiTool([['username', '@username']], '/tools/audit', (r) => h('pre', {}, r.report)),
  'Username checker': () => apiTool([['username', 'username']], '/tools/lookup', (r) => h('div', {}, r.exists ? '❌ Taken by @' + r.user.username : '✅ Available (or suspended)')),
  'Follower counter': () => apiTool([['username', '@username']], '/tools/lookup', (r) => r.exists ? h('div', { class: 'grid g4' }, ['followers_count', 'following_count', 'tweet_count', 'listed_count'].map((k) => h('div', { class: 'stat' }, h('small', {}, k.replace('_count', '')), h('b', {}, fmt(r.user.public_metrics[k]))))) : h('div', {}, 'Not found')),
  'Shadowban checker': () => apiTool([['username', '@username']], '/tools/shadowban', (r) => h('div', {}, r.likelyRestricted ? '⚠️ Posts not surfacing in search' : `✅ ${r.visibleInSearch}/${r.checked} recent posts visible in search`, h('p', { class: 'mute' }, r.note))),
  'Media downloader': () => apiTool([['url', 'Post URL']], '/tools/media', (r) => h('div', {}, r.media.length ? r.media.map((m) => h('div', { class: 'post' }, m.type, ' ', h('a', { href: m.best, target: '_blank', download: true }, 'Download'))) : 'No media found')),
  'Tweet deleter': () => { const d = h('input', { type: 'number', value: 30, placeholder: 'Older than (days)' }), l = h('input', { type: 'number', value: 0, placeholder: 'Max likes' }); const out = h('div', {}); const go = (dry) => async () => { try { const r = await api('/tools/bulk-delete', { body: { accountId: state.account, olderThanDays: +d.value, maxLikes: +l.value, dryRun: dry } }); out.textContent = dry ? `Would delete ${r.wouldDelete} posts` : `Deleted ${r.deleted}`; } catch (e) { toast(e.message, true); } }; return h('div', {}, h('p', { class: 'mute' }, 'Operates on posts synced into analytics.'), h('div', { class: 'row' }, d, l, h('button', { class: 'ghost', onclick: go(true) }, 'Preview'), h('button', { class: 'danger', onclick: () => confirm('Delete permanently?') && go(false)() }, 'Delete')), out); },
};

export async function toolsPage() {
  const body = h('div', { class: 'card' }); const names = Object.keys(TOOLS);
  const pick = async (n) => { body.replaceChildren(h('h3', {}, n), await TOOLS[n]()); };
  const first = location.hash.split('?t=')[1] ? decodeURIComponent(location.hash.split('?t=')[1]) : names[0];
  await pick(first);
  return h('div', {}, h('h2', {}, 'Free tools'), h('div', { class: 'row', style: 'margin-bottom:14px' }, names.map((n) => h('button', { class: 'ghost', onclick: () => pick(n) }, n))), body);
}
