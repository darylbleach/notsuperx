import { h, api, toast, fmt, when, DOW, copy, state, tz } from './lib.js';

const acct = () => state.account;
const need = () => acct() ? null : h('div', { class: 'card' }, 'Connect an X account first: ', h('a', { href: '#/settings' }, 'Settings →'));
const stat = (k, v) => h('div', { class: 'stat' }, h('small', {}, k), h('b', {}, v));
const meter = (pct) => h('div', { class: 'meter' }, h('i', { style: `width:${Math.max(0, Math.min(100, pct))}%` }));
const shieldTag = (s) => h('span', { class: 'tag ' + (s.score >= 60 ? 'failed' : s.score >= 35 ? 'draft' : 'posted'), title: s.reasons.join('; ') }, `🛡 ${s.label} ${s.score}`);

/* ---------- Insights (growth intelligence) ---------- */
export async function insights() {
  if (need()) return need();
  const i = await api(`/insights?account=${acct()}`);
  const heat = h('div', { class: 'heat' }, h('span', { style: 'background:none' }));
  for (let hr = 0; hr < 24; hr++) heat.append(h('span', { style: 'background:none;text-align:center' }, hr % 3 ? '' : hr));
  const mx = Math.max(1, ...Object.values(i.audienceActivity));
  for (let d = 0; d < 7; d++) { heat.append(h('span', { style: 'background:none;aspect-ratio:auto' }, DOW[d])); for (let hr = 0; hr < 24; hr++) { const v = i.audienceActivity[`${d}-${hr}`] || 0; heat.append(h('span', { title: `${DOW[d]} ${hr}:00 UTC · ${v} engagements`, style: v ? `background:rgba(138,92,255,${0.2 + 0.8 * v / mx})` : '' })); } }
  const post = (t) => h('div', { class: 'post' }, t.text, h('div', { class: 'mute' }, `${fmt(t.impressions)} imp · ${t.likes} ♥ · ${t.replies} 💬 · ${t.reposts} ⟲ · ${t.type}`));
  return h('div', {}, h('h2', {}, 'Growth intelligence'), h('p', { class: 'mute' }, `Based on ${i.posts} synced posts (90 days).`),
    h('div', { class: 'card' }, h('h3', {}, 'What works: with vs without'), i.comparison.length ? h('table', {}, h('tr', {}, ['Trait', 'With (posts · avg eng.)', 'Without', 'Lift'].map((x) => h('th', {}, x))),
      i.comparison.map((c) => h('tr', {}, h('td', {}, c.trait), h('td', {}, `${c.with.posts} · ${c.with.avgEngagement}`), h('td', {}, `${c.without.posts} · ${c.without.avgEngagement}`), h('td', { class: c.liftPct > 0 ? 'pill-g' : 'pill-r' }, c.liftPct == null ? '—' : (c.liftPct > 0 ? '+' : '') + c.liftPct + '%')))) : 'Sync analytics first.'),
    h('div', { class: 'card' }, h('h3', {}, 'Posting frequency vs. performance'), h('p', { class: 'mute' }, 'Avg impressions per post by posts-that-day'),
      h('div', { class: 'row' }, Object.entries(i.frequency.avgImpressionsPerPostByDailyVolume).map(([k, v]) => stat(k + ' post(s)/day', fmt(v))))),
    h('div', { class: 'split' }, h('div', { class: 'card' }, h('h3', {}, 'Best posts'), i.best.map(post)), h('div', { class: 'card' }, h('h3', {}, 'Worst posts'), i.worst.map(post))),
    h('div', { class: 'card' }, h('h3', {}, 'Audience activity (UTC) — when people who engage with you are active'), h('p', { class: 'mute' }, 'Builds up from mentions/replies on each sync. Blended 40% into smart-scheduler slots.'), heat),
    h('div', { class: 'card' }, h('h3', {}, 'Interaction matrix'), h('button', { class: 'ghost', onclick: async (e) => { e.target.disabled = true; try { const m = await api(`/interactions?account=${acct()}`); e.target.parentNode.append(h('table', {}, h('tr', {}, ['Who', 'Followers', 'Replies', 'Quotes', 'Mentions'].map((x) => h('th', {}, x))), m.map((u) => h('tr', {}, h('td', {}, '@' + u.username), h('td', {}, fmt(u.followers)), h('td', {}, u.replies), h('td', {}, u.quotes), h('td', {}, u.mentions))))); } catch (x) { toast(x.message, true); } e.target.remove(); } }, 'Load who interacts with you')));
}

/* ---------- Inbox: replies + quotes tracking ---------- */
export async function inbox() {
  if (need()) return need();
  const kind = new URLSearchParams(location.hash.split('?')[1] || '').get('kind') || '';
  const items = await api(`/inbox?account=${acct()}${kind ? '&kind=' + kind : ''}`);
  const tabs = ['', 'reply', 'quote', 'text'].map((k) => h('button', { class: 'ghost' + (k === kind ? ' on' : ''), onclick: () => { location.hash = '#/inbox' + (k ? '?kind=' + k : ''); } }, k || 'all'));
  return h('div', {}, h('h2', {}, 'Inbox'), h('p', { class: 'mute' }, 'Replies, quote-posts and mentions. 🛡 = AI Shield: likelihood a reply was AI-generated.'), h('div', { class: 'tabs' }, tabs),
    items.map((t) => { const ta = h('textarea', { style: 'min-height:50px', placeholder: 'Reply…' });
      return h('div', { class: 'post', style: t.handled ? 'opacity:.55' : '' }, h('b', {}, '@' + (t.author?.username || '?')), ' ', h('span', { class: 'tag' }, t.kind), ' ', shieldTag(t.shield), h('div', {}, t.text),
        h('div', { class: 'row', style: 'margin-top:6px' },
          h('button', { class: 'ghost', onclick: async () => { try { const r = (await api('/ai/replies', { body: { text: t.text, author: t.author?.username } })).result; ta.value = r[0]; } catch (e) { toast(e.message, true); } } }, '✨ Draft'),
          h('button', { class: 'ghost', onclick: async () => { await api('/inbox/handled', { body: { accountId: acct(), postId: t.id, handled: !t.handled } }); location.reload(); } }, t.handled ? 'Unmark' : 'Mark done')), ta,
        h('button', { onclick: async () => { try { await api('/reply', { body: { accountId: acct(), postId: t.id, text: ta.value, like: true } }); await api('/inbox/handled', { body: { accountId: acct(), postId: t.id } }); toast('Replied'); location.reload(); } catch (e) { toast(e.message, true); } } }, 'Reply + like')); }));
}

/* ---------- Custom timelines ---------- */
export async function timelines() {
  if (need()) return need();
  const list = await api(`/timelines?account=${acct()}`); const feed = h('div', {});
  const n = h('input', { placeholder: 'Timeline name' }), q = h('input', { placeholder: 'Keywords / X search (optional), e.g. "pricing" OR "churn"' }), u = h('input', { placeholder: 'Accounts (comma separated) e.g. @ada, grace' });
  return h('div', {}, h('h2', {}, 'Custom timelines'), h('p', { class: 'mute' }, 'Build feeds from lists of accounts and/or keywords, without the algorithm.'),
    h('div', { class: 'card' }, n, q, u, h('div', { style: 'margin-top:8px' }, h('button', { onclick: async () => { await api('/timelines', { body: { accountId: acct(), name: n.value, query: q.value, users: u.value.split(',').map((x) => x.trim()).filter(Boolean) } }); location.reload(); } }, 'Create'))),
    list.map((t) => h('div', { class: 'card' }, h('div', { class: 'row' }, h('b', { class: 'grow' }, t.name), h('span', { class: 'mute' }, [...t.users.map((x) => '@' + x), t.query].filter(Boolean).join(' · ')),
      h('button', { class: 'ghost', onclick: async (e) => { e.target.disabled = true; try { const f = await api(`/timelines/${t.id}/feed`); feed.replaceChildren(h('div', { class: 'card' }, h('h3', {}, t.name), ...f.map((x) => h('div', { class: 'post' }, h('b', {}, '@' + (x.author?.username || '?')), ' ', h('span', { class: 'mute' }, fmt(x.public_metrics?.like_count) + ' ♥'), h('div', {}, x.text), h('a', { href: `https://x.com/i/status/${x.id}`, target: '_blank' }, 'open'))))); } catch (x) { toast(x.message, true); } e.target.disabled = false; } }, 'Open'),
      h('button', { class: 'danger', onclick: async () => { await api('/timelines/' + t.id, { method: 'DELETE' }); location.reload(); } }, 'Delete')))), feed);
}

/* ---------- X Articles ---------- */
export async function articles() {
  if (need()) return need();
  const list = await api(`/articles?account=${acct()}`); const id = +new URLSearchParams(location.hash.split('?')[1] || '').get('id');
  if (!id) return h('div', {}, h('h2', {}, 'X Articles'), h('p', { class: 'mute' }, 'Draft long-form with AI, add a cover, then export and paste into X\'s article editor (X has no publishing API).'),
    h('button', { onclick: async () => { const r = await api('/articles', { body: { accountId: acct(), title: 'Untitled article' } }); location.hash = '#/articles?id=' + r.id; } }, 'New article'),
    h('div', { style: 'height:12px' }), list.map((a) => h('div', { class: 'card' }, h('a', { href: '#/articles?id=' + a.id }, a.title), ' ', h('span', { class: 'mute' }, when(a.updated_at)))));
  const a = await api('/articles/' + id);
  const title = h('input', { value: a.title }), md = h('textarea', { style: 'min-height:380px;font-family:ui-monospace,monospace' }, a.markdown), cover = h('div', { html: a.cover_svg || '' }); let svg = a.cover_svg || '';
  const prev = h('div', { class: 'md card' }); const render = () => { prev.replaceChildren(h('div', { html: mdPreview(md.value) })); }; md.addEventListener('input', render); render();
  const save = async () => { await api('/articles/' + id, { method: 'PUT', body: { title: title.value, markdown: md.value, coverSvg: svg } }); toast('Saved'); };
  const gen = (kind) => async (e) => { e.target.disabled = true; try { const r = (await api('/ai/' + kind, { body: { topic: title.value, outline: md.value } })).result; if (kind === 'article') { md.value = r; render(); } else { svg = r.replace(/^[\s\S]*?(<svg)/, '$1').replace(/<\/svg>[\s\S]*$/, '</svg>'); cover.innerHTML = svg; } } catch (x) { toast(x.message, true); } e.target.disabled = false; };
  return h('div', {}, h('div', { class: 'row' }, h('a', { href: '#/articles' }, '← All'), h('h2', { class: 'grow', style: 'margin:0' }, 'Article editor')), title, cover,
    h('div', { class: 'row', style: 'margin:8px 0' }, h('button', { onclick: save }, 'Save'), h('button', { class: 'ghost', onclick: gen('article') }, '✨ Draft with AI'), h('button', { class: 'ghost', onclick: gen('cover') }, '🖼 AI cover (SVG)'),
      h('a', { class: 'btn', href: `/api/articles/${id}/export.md`, style: 'background:var(--panel2)' }, '.md'), h('a', { class: 'btn', href: `/api/articles/${id}/export.html`, style: 'background:var(--panel2)' }, '.html'),
      h('button', { class: 'ghost', onclick: () => copy(md.value) }, 'Copy markdown'), h('button', { class: 'danger', onclick: async () => { await api('/articles/' + id, { method: 'DELETE' }); location.hash = '#/articles'; } }, 'Delete')),
    h('div', { class: 'split' }, md, prev));
}
export function mdPreview(src) {
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;'); const il = (s) => esc(s).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/\*([^*]+)\*/g, '<i>$1</i>').replace(/`([^`]+)`/g, '<code>$1</code>');
  return src.split('\n').map((l) => { let m; if ((m = l.match(/^(#{1,4})\s+(.*)/))) return `<h${m[1].length}>${il(m[2])}</h${m[1].length}>`; if ((m = l.match(/^[-*]\s+(.*)/))) return `<li>${il(m[1])}</li>`; if ((m = l.match(/^>\s?(.*)/))) return `<blockquote>${il(m[1])}</blockquote>`; return l.trim() ? `<p>${il(l)}</p>` : ''; }).join('');
}
