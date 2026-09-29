import { h, api, toast, fmt, when, DOW, copy, state, tz, composer, xLen } from './lib.js';
import { toolsPage } from './tools.js';

export const nav = [
  ['dashboard', '📊 Analytics'], ['compose', '✍️ Compose'], ['queue', '🗓 Scheduler'], ['ai', '✨ AI Writer'],
  ['inspiration', '🔥 Inspiration'], ['engage', '💬 Engage'], ['automations', '⚙️ Automations'],
  ['agents', '🎯 Signal Agents'], ['tools', '🧰 Free Tools'], ['settings', '🔧 Settings'],
];
const acct = () => state.account;
const need = () => acct() ? null : h('div', { class: 'card' }, 'Connect an X account first: ', h('a', { href: '#/settings' }, 'Settings →'));
const bar = (vals, label) => { const m = Math.max(1, ...vals.map((v) => v.v)); return h('div', { class: 'bars' }, vals.map((v) => h('i', { style: `height:${(v.v / m) * 100}%`, title: `${v.k}: ${label(v.v)}` }))); };
const stat = (k, v) => h('div', { class: 'stat' }, h('small', {}, k), h('b', {}, v));

/* ---------------- Analytics ---------------- */
async function dashboard() {
  if (need()) return need();
  const days = +(localStorage.getItem('days') || 30);
  const a = await api(`/analytics?account=${acct()}&days=${days}`);
  const heat = h('div', { class: 'heat' }, h('span', { style: 'background:none' }));
  for (let hr = 0; hr < 24; hr++) heat.append(h('span', { style: 'background:none;text-align:center' }, hr % 3 ? '' : hr));
  const max = Math.max(1, ...a.heatmap.map((c) => c.score));
  for (let d = 0; d < 7; d++) {
    heat.append(h('span', { style: 'background:none;aspect-ratio:auto' }, DOW[d]));
    for (let hr = 0; hr < 24; hr++) {
      const c = a.heatmap.find((x) => x.dow === d && x.hour === hr);
      heat.append(h('span', { title: c ? `${DOW[d]} ${hr}:00 UTC · avg eng ${c.score.toFixed(1)} (${c.n} posts)` : '', style: c ? `background:rgba(109,139,255,${0.15 + 0.85 * c.score / max})` : '' }));
    }
  }
  return h('div', {},
    h('div', { class: 'row' }, h('h2', { class: 'grow' }, 'Analytics'),
      h('select', { style: 'width:auto', onchange: (e) => { localStorage.setItem('days', e.target.value); location.reload(); } }, [7, 30, 90, 365].map((d) => h('option', { value: d, selected: d === days }, `${d} days`))),
      h('button', { onclick: async (e) => { e.target.disabled = true; try { const r = await api(`/accounts/${acct()}/sync`, { method: 'POST', body: {} }); toast(`Synced ${r.synced} posts`); location.reload(); } catch (x) { toast(x.message, true); e.target.disabled = false; } } }, 'Sync now'),
      h('a', { class: 'btn ghost', href: `/api/analytics/export.csv?account=${acct()}`, style: 'background:var(--panel2)' }, 'CSV')),
    h('div', { class: 'grid g4' }, stat('Impressions', fmt(a.impressions)), stat('Engagements', fmt(a.engagements)), stat('Engagement rate', a.engagementRate + '%'),
      stat('Followers gained', (a.followersGained >= 0 ? '+' : '') + a.followersGained), stat('Followers / 1k imp.', a.followersPer1kImpressions), stat('Posts', a.posts),
      stat('Link clicks', fmt(a.linkClicks)), stat('Profile clicks', fmt(a.profileClicks))),
    h('div', { style: 'height:16px' }),
    h('div', { class: 'grid g2' },
      h('div', { class: 'card' }, h('h3', {}, 'Impressions per day'), bar(a.daily.map((d) => ({ k: d.day, v: d.impressions })), fmt)),
      h('div', { class: 'card' }, h('h3', {}, 'Followers'), a.followerSeries.length > 1 ? bar(a.followerSeries.map((d) => ({ k: d.day, v: d.followers - a.followerSeries[0].followers + 1 })), (v) => '+' + (v - 1)) : h('span', { class: 'mute' }, 'Needs 2+ days of snapshots (hourly sync collects them).'))),
    h('div', { class: 'card' }, h('h3', {}, 'Best time to post (UTC hours; your data)'), heat),
    h('div', { class: 'card' }, h('h3', {}, 'Performance by post type'),
      h('table', {}, h('tr', {}, ['Type', 'Posts', 'Impressions', 'Engagements', 'Eng/post'].map((x) => h('th', {}, x))),
        a.byType.map((t) => h('tr', {}, h('td', {}, t.type), h('td', {}, t.posts), h('td', {}, fmt(t.impressions)), h('td', {}, fmt(t.engagements)), h('td', {}, (t.engagements / t.posts).toFixed(1)))))),
    h('div', { class: 'card' }, h('h3', {}, 'Top posts'),
      a.top.map((t) => h('div', { class: 'post' }, t.text, h('div', { class: 'mute' }, `${fmt(t.impressions)} imp · ${t.likes} ♥ · ${t.reposts} ⟲ · ${t.replies} 💬 · ${t.bookmarks} 🔖 · `, h('a', { href: `https://x.com/i/status/${t.x_post_id}`, target: '_blank' }, 'open'))))));
}

/* ---------------- Compose ---------------- */
async function compose() {
  if (need()) return need();
  const draft = JSON.parse(sessionStorage.getItem('draft') || '{}'); sessionStorage.removeItem('draft');
  const c = composer(draft.text || '');
  const when_ = h('input', { type: 'datetime-local' });
  const bsky = h('input', { type: 'checkbox', style: 'width:auto' });
  const media = []; const prev = h('div', { class: 'row' });
  const file = h('input', { type: 'file', accept: 'image/*,video/mp4', multiple: true, onchange: async (e) => {
    for (const f of e.target.files) {
      if (media.length >= 4) break;
      const dataUrl = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(f); });
      media.push({ dataUrl }); prev.append(f.type.startsWith('image') ? h('img', { src: dataUrl, style: 'height:60px;border-radius:6px' }) : h('span', { class: 'tag' }, f.name));
    }
  } });
  const send = (mode) => async () => {
    try {
      const body = { accountId: acct(), text: c.ta.value, mode, bluesky: bsky.checked, media, tz: tz() };
      if (mode === 'schedule') body.scheduledAt = Math.floor(new Date(when_.value).getTime() / 1000);
      const p = await api('/posts', { body });
      toast(p.status === 'posted' ? 'Posted!' : p.status === 'failed' ? 'Failed: ' + p.error : `Saved (${p.status}${p.scheduled_at ? ' @ ' + when(p.scheduled_at) : ''})`, p.status === 'failed');
      if (p.status !== 'failed') { c.set(''); media.length = 0; prev.replaceChildren(); }
    } catch (e) { toast(e.message, true); }
  };
  return h('div', {}, h('h2', {}, 'Compose'), h('div', { class: 'card' }, c.el,
    h('label', {}, 'Media (up to 4 images or 1 video)'), file, prev,
    h('div', { class: 'row' }, h('label', { style: 'margin:0' }, bsky, ' Cross-post to Bluesky', state.status.bluesky ? '' : ' (not configured)')),
    h('div', { class: 'row', style: 'margin-top:12px' },
      h('button', { onclick: send('now') }, 'Post now'), h('button', { onclick: send('queue') }, 'Add to queue (smart slot)'),
      when_, h('button', { class: 'ghost', onclick: send('schedule') }, 'Schedule'), h('button', { class: 'ghost', onclick: send('draft') }, 'Save draft'))));
}

/* ---------------- Scheduler ---------------- */
async function queue() {
  if (need()) return need();
  const [posts, slots] = await Promise.all([api(`/posts?account=${acct()}`), api(`/slots?account=${acct()}`)]);
  const sched = posts.filter((p) => p.status === 'scheduled').sort((a, b) => a.scheduled_at - b.scheduled_at);
  const cal = h('div', { class: 'cal' });
  const today = new Date(); today.setHours(0, 0, 0, 0);
  for (let i = 0; i < 14; i++) {
    const d = new Date(today.getTime() + i * 864e5);
    const items = sched.filter((p) => new Date(p.scheduled_at * 1000).toDateString() === d.toDateString());
    cal.append(h('div', {}, h('div', { class: 'd' }, d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })),
      items.map((p) => h('div', { title: p.text, style: 'margin-top:4px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis' }, new Date(p.scheduled_at * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' ' + p.text))));
  }
  const slotEd = h('input', { placeholder: 'e.g. 09:00, 12:30, 17:00', value: [...new Set(slots.map((s) => `${String(s.hour).padStart(2, '0')}:${String(s.minute).padStart(2, '0')}`))].join(', ') });
  const days = new Set(slots.map((s) => s.dow)); if (!slots.length) [0, 1, 2, 3, 4, 5, 6].forEach((d) => days.add(d));
  const dayBoxes = DOW.map((n, i) => h('label', { style: 'display:inline-flex;gap:4px;margin-right:10px;color:var(--fg)' }, h('input', { type: 'checkbox', style: 'width:auto', checked: days.has(i), onchange: (e) => (e.target.checked ? days.add(i) : days.delete(i)) }), n));
  const row = (p) => h('tr', {}, h('td', {}, h('span', { class: 'tag ' + p.status }, p.status)), h('td', {}, p.text.slice(0, 140) + (p.thread.length ? ` (+${p.thread.length} in thread)` : ''), p.error && h('div', { style: 'color:var(--bad)' }, p.error)),
    h('td', {}, when(p.scheduled_at || p.posted_at)),
    h('td', { class: 'row' }, p.status !== 'posted' && h('button', { class: 'ghost', onclick: async () => { try { await api(`/posts/${p.id}/publish`, { method: 'POST', body: {} }); toast('Posted'); location.reload(); } catch (e) { toast(e.message, true); } } }, 'Post now'),
      p.status === 'draft' && h('button', { class: 'ghost', onclick: async () => { const { at } = await api(`/next-slot?account=${acct()}&tz=${tz()}`); await api(`/posts/${p.id}`, { method: 'PATCH', body: { status: 'scheduled', scheduledAt: at } }); location.reload(); } }, 'Queue'),
      p.status === 'failed' && h('button', { class: 'ghost', onclick: async () => { await api(`/posts/${p.id}`, { method: 'PATCH', body: { status: 'draft' } }); location.reload(); } }, 'To draft'),
      h('button', { class: 'danger', onclick: async () => { await api(`/posts/${p.id}${p.status === 'posted' ? '?fromX=1' : ''}`, { method: 'DELETE' }); location.reload(); } }, 'Delete')));
  return h('div', {}, h('h2', {}, 'Scheduler'),
    h('div', { class: 'card' }, h('h3', {}, 'Next 14 days'), cal),
    h('div', { class: 'card' }, h('h3', {}, 'Queue slots'), h('p', { class: 'mute' }, 'Times use your browser timezone. If none are set, slots are derived from your best-performing hours.'),
      h('div', {}, dayBoxes), slotEd,
      h('div', { style: 'margin-top:8px' }, h('button', { onclick: async () => {
        const times = slotEd.value.split(',').map((t) => t.trim().match(/^(\d{1,2}):(\d{2})$/)).filter(Boolean);
        const off = tz(); const out = [];
        for (const d of days) for (const m of times) { let mins = +m[1] * 60 + +m[2] - off; let dd = d; while (mins < 0) { mins += 1440; dd = (dd + 6) % 7; } while (mins >= 1440) { mins -= 1440; dd = (dd + 1) % 7; } out.push({ dow: dd, hour: Math.floor(mins / 60), minute: mins % 60 }); }
        await api('/slots', { method: 'PUT', body: { accountId: acct(), slots: out } }); toast('Slots saved'); } }, 'Save slots'))),
    h('div', { class: 'card' }, h('h3', {}, 'All posts'), h('table', {}, posts.map(row))));
}

/* ---------------- AI Writer ---------------- */
async function aiPage() {
  const voice = (await api('/voice')).voice;
  const usage = await api('/ai/usage').catch(() => ({}));
  const out = h('div', {});
  const topic = h('textarea', { placeholder: 'Topic, idea, or post to rewrite…', style: 'min-height:80px' });
  const extra = h('input', { placeholder: 'Tone / niche / trend (optional)' });
  const results = (items) => out.replaceChildren(...(Array.isArray(items) ? items : [items]).map((t) => h('div', { class: 'post' }, t,
    h('div', { class: 'row', style: 'margin-top:8px' }, h('span', { class: 'count' }, xLen(t) + ' chars'),
      h('button', { class: 'ghost', onclick: () => copy(t) }, 'Copy'),
      h('button', { class: 'ghost', onclick: () => { sessionStorage.setItem('draft', JSON.stringify({ text: t })); location.hash = '#/compose'; } }, 'Compose ↗'),
      acct() && h('button', { class: 'ghost', onclick: async () => { await api('/posts', { body: { accountId: acct(), text: t, mode: 'queue', tz: tz() } }); toast('Queued'); } }, 'Queue')))));
  const run = (kind, mk, thread) => async (e) => {
    e.target.disabled = true; out.replaceChildren(h('span', { class: 'mute' }, 'Thinking…'));
    try {
      const r = (await api('/ai/' + kind, { body: mk() })).result;
      if (thread) out.replaceChildren(h('div', { class: 'post' }, r.join('\n\n———\n\n'), h('div', { class: 'row', style: 'margin-top:8px' },
        h('button', { class: 'ghost', onclick: () => copy(r.join('\n\n')) }, 'Copy'),
        acct() && h('button', { onclick: async () => { await api('/posts', { body: { accountId: acct(), text: r[0], thread: r.slice(1), mode: 'queue', tz: tz() } }); toast('Thread queued'); } }, 'Queue thread'))));
      else if (kind === 'cover') out.replaceChildren(h('div', { html: r.replace(/^[\s\S]*?(<svg)/, '$1').replace(/<\/svg>[\s\S]*$/, '</svg>') }), h('button', { class: 'ghost', onclick: () => copy(r) }, 'Copy SVG'));
      else results(r);
    } catch (x) { out.replaceChildren(h('div', { style: 'color:var(--bad)' }, x.message)); }
    e.target.disabled = false;
  };
  const chat = []; const chatLog = h('div', {}); const chatIn = h('input', { placeholder: 'Chat with an AI that writes in your voice…', onkeydown: async (e) => {
    if (e.key !== 'Enter' || !chatIn.value) return;
    chat.push({ role: 'user', content: chatIn.value }); chatLog.append(h('div', { class: 'post' }, '🧑 ' + chatIn.value)); chatIn.value = '';
    try { const r = (await api('/ai/chat', { body: { messages: chat } })).result; chat.push({ role: 'assistant', content: r }); chatLog.append(h('div', { class: 'post' }, r, h('button', { class: 'ghost', onclick: () => copy(r) }, 'Copy'))); } catch (x) { toast(x.message, true); }
  } });
  const vbox = h('textarea', { placeholder: 'Paste 5–10 of your best posts + notes about your style. All AI output will match it.' }, voice);
  return h('div', {}, h('h2', {}, 'AI Writer'), !state.status.ai && h('div', { class: 'card', style: 'border-color:var(--warn)' }, 'Set ANTHROPIC_API_KEY to enable AI.'),
    h('div', { class: 'card' }, topic, extra, h('div', { class: 'row', style: 'margin-top:10px' },
      h('button', { onclick: run('posts', () => ({ topic: topic.value, tone: extra.value })) }, 'Posts'),
      h('button', { onclick: run('thread', () => ({ topic: topic.value }), true) }, 'Thread'),
      h('button', { onclick: run('rewrite', () => ({ text: topic.value, tone: extra.value })) }, 'Rewrite'),
      h('button', { onclick: run('trend', () => ({ trend: topic.value, niche: extra.value })) }, 'From trend'),
      h('button', { onclick: run('ready', () => ({ niche: extra.value || topic.value })) }, 'Ready-to-post (from viral library)'),
      h('button', { class: 'ghost', onclick: run('replies', () => ({ text: topic.value })) }, 'Reply ideas'),
      h('button', { class: 'ghost', onclick: run('article', () => ({ topic: topic.value })) }, 'X Article'),
      h('button', { class: 'ghost', onclick: run('cover', () => ({ title: topic.value })) }, 'Article cover')),
      h('div', { class: 'count', style: 'margin-top:8px' }, `This month: ${usage.calls ?? 0} AI calls · ${fmt(usage.tokens ?? 0)} tokens`)),
    out,
    h('div', { class: 'card' }, h('h3', {}, 'Chat'), chatLog, chatIn),
    h('div', { class: 'card' }, h('h3', {}, 'Your voice'), vbox, h('div', { style: 'margin-top:8px' }, h('button', { onclick: async () => { await api('/voice', { method: 'PUT', body: { voice: vbox.value } }); toast('Voice saved'); } }, 'Save voice'))));
}

/* ---------------- Inspiration ---------------- */
async function inspiration() {
  const q = h('input', { placeholder: 'Search text…' }), niche = h('input', { placeholder: 'Niche filter' });
  const list = h('div', {});
  const load = async () => {
    const rows = await api(`/viral?q=${encodeURIComponent(q.value)}&niche=${encodeURIComponent(niche.value)}`);
    list.replaceChildren(...rows.map((v) => h('div', { class: 'post' }, v.text, h('div', { class: 'mute', style: 'margin-top:6px' }, `@${v.author} · ${fmt(v.likes)} ♥ · ${fmt(v.reposts)} ⟲ · ${v.niche || 'no niche'} `,
      h('a', { href: '#', onclick: (e) => { e.preventDefault(); sessionStorage.setItem('draft', JSON.stringify({ text: v.text })); location.hash = '#/compose'; } }, 'use'), ' · ',
      h('a', { href: '#', onclick: async (e) => { e.preventDefault(); await api('/viral/' + v.id, { method: 'DELETE' }); load(); } }, 'remove')))));
    if (!rows.length) list.replaceChildren(h('div', { class: 'mute' }, 'Empty. Discover from X below, add manually, or save posts with the Chrome extension.'));
  };
  const dq = h('input', { placeholder: 'Discovery query, e.g. "saas founder" or "(indie hacker OR bootstrapped)"' }), dn = h('input', { placeholder: 'Niche label' }), dl = h('input', { type: 'number', value: 100, style: 'width:100px' });
  const mt = h('textarea', { placeholder: 'Paste a great post to save…' }), ma = h('input', { placeholder: '@author' }), ml = h('input', { type: 'number', placeholder: 'likes', style: 'width:100px' });
  const trends = h('div', {});
  return h('div', {}, h('h2', {}, 'Inspiration'),
    h('div', { class: 'card' }, h('h3', {}, 'Discover viral posts in your niche'), h('p', { class: 'mute' }, 'Searches recent posts via the X API and keeps those above a like threshold, building your own library.'),
      h('div', { class: 'row' }, dq, dn, dl, h('button', { onclick: async (e) => { e.target.disabled = true; try { const r = await api('/viral/discover', { body: { accountId: acct(), query: dq.value, niche: dn.value, minLikes: +dl.value } }); toast(`Saved ${r.saved}`); load(); } catch (x) { toast(x.message, true); } e.target.disabled = false; } }, 'Discover'))),
    h('div', { class: 'card' }, h('h3', {}, 'Trends'), h('button', { class: 'ghost', onclick: async () => { try { const r = await api(`/trends?account=${acct()}`); trends.replaceChildren(...(r.data || []).map((t) => h('span', { class: 'tag', style: 'margin:3px;cursor:pointer', onclick: () => { sessionStorage.setItem('draft', JSON.stringify({ text: '' })); toast('Go to AI Writer → From trend with: ' + t.trend_name); } }, t.trend_name + (t.post_count ? ` · ${fmt(t.post_count)}` : '')))); } catch (x) { toast(x.message, true); } } }, 'Load trending now'), trends),
    h('div', { class: 'card' }, h('h3', {}, 'Add manually'), mt, h('div', { class: 'row' }, ma, ml, h('button', { class: 'ghost', onclick: async () => { await api('/viral', { body: { text: mt.value, author: ma.value.replace('@', ''), likes: +ml.value || 0, niche: niche.value } }); mt.value = ''; load(); } }, 'Save'))),
    h('div', { class: 'row' }, q, niche, h('button', { onclick: load }, 'Search')), h('div', { style: 'height:10px' }), list, (load(), ''));
}

/* ---------------- Engage + mentions ---------------- */
async function engage() {
  if (need()) return need();
  const [targets] = await Promise.all([api(`/engage/targets?account=${acct()}`)]);
  const feed = h('div', {}), mentions = h('div', {});
  const post = (t, acctId) => {
    const box = h('div', {}); const ta = h('textarea', { style: 'min-height:60px', placeholder: 'Reply…' });
    return h('div', { class: 'post' }, h('b', {}, '@' + (t.author?.username || '?')), ' ', h('span', { class: 'mute' }, t.created_at?.slice(0, 16).replace('T', ' ')), h('div', {}, t.text),
      t.public_metrics && h('div', { class: 'mute' }, `${fmt(t.public_metrics.like_count)} ♥ · ${t.public_metrics.reply_count} 💬`),
      h('div', { class: 'row', style: 'margin-top:6px' }, h('button', { class: 'ghost', onclick: async () => { try { const r = (await api('/ai/replies', { body: { text: t.text, author: t.author?.username } })).result; box.replaceChildren(...r.map((x) => h('div', { class: 'row' }, h('a', { href: '#', onclick: (e) => { e.preventDefault(); ta.value = x; } }, x)))); } catch (e) { toast(e.message, true); } } }, '✨ Suggest replies'),
        h('a', { href: `https://x.com/i/status/${t.id}`, target: '_blank' }, 'open')), box, ta,
      h('button', { onclick: async () => { try { await api('/reply', { body: { accountId: acctId ?? acct(), postId: t.id, text: ta.value, like: true } }); toast('Replied'); ta.value = ''; } catch (e) { toast(e.message, true); } } }, 'Reply + like'));
  };
  const tin = h('input', { placeholder: '@username to track' });
  return h('div', {}, h('h2', {}, 'Engage'),
    h('div', { class: 'card' }, h('h3', {}, 'Engagement targets'), h('div', {}, targets.map((t) => h('span', { class: 'tag', style: 'margin:3px' }, '@' + t.username, ' ', h('a', { href: '#', onclick: async (e) => { e.preventDefault(); await api('/engage/targets/' + t.id, { method: 'DELETE' }); location.reload(); } }, '×')))),
      h('div', { class: 'row', style: 'margin-top:8px' }, tin, h('button', { onclick: async () => { await api('/engage/targets', { body: { accountId: acct(), username: tin.value } }); location.reload(); } }, 'Add'),
        h('button', { class: 'ghost', onclick: async (e) => { e.target.disabled = true; try { const f = await api(`/engage/feed?account=${acct()}`); feed.replaceChildren(...f.map((t) => post(t))); if (!f.length) feed.textContent = 'Nothing yet — add targets.'; } catch (x) { toast(x.message, true); } e.target.disabled = false; } }, 'Load reply opportunities'))), feed,
    h('div', { class: 'card' }, h('h3', {}, 'Unified mentions (all accounts)'), h('button', { class: 'ghost', onclick: async (e) => { e.target.disabled = true; try { const m = await api('/mentions'); mentions.replaceChildren(...m.map((t) => t.error ? h('div', { class: 'post' }, `@${t.account}: ${t.error}`) : h('div', {}, h('span', { class: 'tag' }, 'to @' + t.account), post(t, t.accountId)))); } catch (x) { toast(x.message, true); } e.target.disabled = false; } }, 'Load mentions'), mentions));
}

/* ---------------- Automations ---------------- */
const AUTO = {
  retweet: { name: 'Auto Retweet', desc: 'Re-surface your own posts after a delay if they got traction.', fields: [['afterHours', 'After hours', 24], ['minLikes', 'Min likes', 5]] },
  plug: { name: 'Auto Plug', desc: 'Reply under a post with your CTA/link once it crosses a like threshold.', fields: [['likeThreshold', 'Like threshold', 50], ['text', 'Plug text', '']] },
  dm: { name: 'Auto DM', desc: 'DM people who reply to your posts (optionally only if reply has a keyword).', fields: [['keyword', 'Keyword (optional)', ''], ['text', 'DM text', '']] },
  delete: { name: 'Auto Delete', desc: 'Delete low-performing posts after a delay.', fields: [['afterHours', 'After hours', 48], ['maxEngagement', 'Max total engagement', 0], ['dryRun', 'Dry run (log only, 1/0)', 1]] },
};
async function automations() {
  if (need()) return need();
  const [list, log] = await Promise.all([api(`/automations?account=${acct()}`), api('/automations/log')]);
  const inputs = {};
  const forms = Object.entries(AUTO).map(([type, d]) => { inputs[type] = {};
    return h('div', { class: 'card' }, h('h3', {}, d.name), h('p', { class: 'mute' }, d.desc),
      d.fields.map(([k, l, def]) => h('div', {}, h('label', {}, l), inputs[type][k] = h('input', { value: def }))),
      h('div', { style: 'margin-top:8px' }, h('button', { onclick: async () => { const config = {}; for (const [k, el] of Object.entries(inputs[type])) config[k] = el.value !== '' && !isNaN(el.value) ? +el.value : el.value; if (type === 'delete') config.dryRun = !!config.dryRun; await api('/automations', { body: { accountId: acct(), type, config } }); location.reload(); } }, 'Enable')));
  });
  return h('div', {}, h('h2', {}, 'Automations'), h('p', { class: 'mute' }, 'Run every 15 minutes on the server (Cloudflare Cron). Works on posts synced into analytics.'),
    h('div', { class: 'card' }, h('h3', {}, 'Active'), list.length ? h('table', {}, list.map((a) => h('tr', {}, h('td', {}, AUTO[a.type].name), h('td', { class: 'mute' }, JSON.stringify(a.config)),
      h('td', {}, h('button', { class: 'ghost', onclick: async () => { await api('/automations/' + a.id, { method: 'PATCH', body: { enabled: !a.enabled } }); location.reload(); } }, a.enabled ? 'Pause' : 'Resume')),
      h('td', {}, h('button', { class: 'danger', onclick: async () => { await api('/automations/' + a.id, { method: 'DELETE' }); location.reload(); } }, 'Delete'))))) : h('span', { class: 'mute' }, 'None yet.'),
      h('div', { style: 'margin-top:8px' }, h('button', { class: 'ghost', onclick: async () => { await api('/automations/run', { method: 'POST', body: {} }); toast('Ran'); location.reload(); } }, 'Run now'))),
    h('div', { class: 'grid g2' }, forms),
    h('div', { class: 'card' }, h('h3', {}, 'Log'), h('table', {}, log.map((l) => h('tr', {}, h('td', {}, when(l.created_at)), h('td', {}, l.type || ''), h('td', {}, l.action), h('td', { class: 'mute' }, l.x_post_id), h('td', { class: 'mute' }, l.detail))))));
}

/* ---------------- Signal agents ---------------- */
async function agents() {
  if (need()) return need();
  const list = await api(`/agents?account=${acct()}`);
  const n = h('input', { placeholder: 'Agent name' }), q = h('input', { placeholder: 'X search query, e.g. "looking for" (CRM OR "sales tool")' }), f = h('input', { type: 'number', placeholder: 'Min followers', value: 500 }), dm = h('textarea', { placeholder: 'Auto-DM template (optional). Leave empty to only collect leads.', style: 'min-height:60px' });
  const leads = h('div', {});
  return h('div', {}, h('h2', {}, 'Signal Agents'), h('p', { class: 'mute' }, 'Agents search X every 15 min for buying-intent posts and collect leads (optionally AI-personalized DMs).'),
    h('div', { class: 'card' }, n, q, f, dm, h('div', { style: 'margin-top:8px' }, h('button', { onclick: async () => { await api('/agents', { body: { accountId: acct(), name: n.value, query: q.value, minFollowers: +f.value, autoDm: dm.value } }); location.reload(); } }, 'Create agent'))),
    list.map((a) => h('div', { class: 'card' }, h('div', { class: 'row' }, h('b', { class: 'grow' }, a.name), h('span', { class: 'mute' }, a.query), h('span', { class: 'tag' }, a.leads + ' leads'),
      h('button', { class: 'ghost', onclick: async (e) => { e.target.disabled = true; try { const r = await api(`/agents/${a.id}/run`, { method: 'POST', body: {} }); toast(`${r.found} new leads`); } catch (x) { toast(x.message, true); } e.target.disabled = false; } }, 'Run'),
      h('button', { class: 'ghost', onclick: async () => { const l = await api(`/agents/${a.id}/leads`); leads.replaceChildren(h('div', { class: 'card' }, h('h3', {}, a.name + ' leads'), h('a', { href: `/api/agents/${a.id}/leads.csv` }, 'Download CSV'), h('table', {}, l.map((x) => h('tr', {}, h('td', {}, h('a', { href: 'https://x.com/' + x.username, target: '_blank' }, '@' + x.username)), h('td', {}, fmt(x.followers)), h('td', {}, x.text), h('td', {}, x.dm_sent ? 'DM sent' : '')))))); } }, 'Leads'),
      h('button', { class: 'ghost', onclick: async () => { await api('/agents/' + a.id, { method: 'PATCH', body: { enabled: !a.enabled } }); location.reload(); } }, a.enabled ? 'Pause' : 'Resume'),
      h('button', { class: 'danger', onclick: async () => { await api('/agents/' + a.id, { method: 'DELETE' }); location.reload(); } }, 'Delete')))), leads);
}

/* ---------------- Settings ---------------- */
async function settings() {
  const keys = await api('/keys');
  const s = state.status;
  const nk = h('input', { placeholder: 'Key name' }); const shown = h('pre', { style: 'display:none' });
  return h('div', {}, h('h2', {}, 'Settings'),
    h('div', { class: 'card' }, h('h3', {}, 'X accounts'), s.x ? '' : h('p', { style: 'color:var(--warn)' }, 'Set X_CLIENT_ID / X_CLIENT_SECRET first.'),
      h('table', {}, state.accounts.map((a) => h('tr', {}, h('td', {}, h('img', { src: a.avatar, width: 28, style: 'border-radius:50%;vertical-align:middle' }), ' @' + a.username), h('td', {}, fmt(a.followers) + ' followers'),
        h('td', {}, h('button', { class: 'danger', onclick: async () => { if (confirm('Disconnect and delete its data?')) { await api('/accounts/' + a.id, { method: 'DELETE' }); location.reload(); } } }, 'Remove'))))),
      h('div', { style: 'margin-top:10px' }, h('a', { class: 'btn', href: '/auth/x/start' }, 'Connect X account'))),
    h('div', { class: 'card' }, h('h3', {}, 'Integrations'), h('div', {}, `AI: ${s.ai ? '✅' : '❌'} · Bluesky: ${s.bluesky ? '✅' : '❌'} · X app: ${s.x ? '✅' : '❌'}`)),
    h('div', { class: 'card' }, h('h3', {}, 'API keys (REST, CLI, MCP, Chrome extension)'),
      h('table', {}, keys.map((k) => h('tr', {}, h('td', {}, k.name), h('td', {}, when(k.created_at)), h('td', {}, h('button', { class: 'danger', onclick: async () => { await api('/keys/' + k.id, { method: 'DELETE' }); location.reload(); } }, 'Revoke'))))),
      h('div', { class: 'row', style: 'margin-top:8px' }, nk, h('button', { onclick: async () => { const r = await api('/keys', { body: { name: nk.value } }); shown.style.display = 'block'; shown.textContent = r.key + '\n(shown once)'; } }, 'Create key')), shown,
      h('p', { class: 'mute' }, 'MCP endpoint: ', h('code', {}, location.origin + '/mcp'), ' (Authorization: Bearer <key>). REST: /api/* with the same header.')),
    h('div', { class: 'card' }, h('button', { class: 'ghost', onclick: async () => { await api('/logout', { method: 'POST', body: {} }); location.hash = '#/login'; location.reload(); } }, 'Sign out')));
}

export const pages = { dashboard, compose, queue, ai: aiPage, inspiration, engage, automations, agents, tools: toolsPage, settings };
