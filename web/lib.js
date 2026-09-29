export const $ = (s, r = document) => r.querySelector(s);
export function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (v === true) el.setAttribute(k, '');
    else if (v !== false && v != null) el.setAttribute(k, v);
  }
  for (const k of kids.flat(9)) if (k != null && k !== false) el.append(k.nodeType ? k : document.createTextNode(k));
  return el;
}
export async function api(path, opts = {}) {
  const r = await fetch('/api' + path, { method: opts.method || (opts.body ? 'POST' : 'GET'), headers: { 'content-type': 'application/json' }, body: opts.body ? JSON.stringify(opts.body) : undefined });
  if (r.status === 401) { location.hash = '#/login'; throw new Error('Unauthorized'); }
  const ct = r.headers.get('content-type') || '';
  const data = ct.includes('json') ? await r.json() : await r.text();
  if (!r.ok) throw new Error(data.error || r.statusText);
  return data;
}
export function toast(msg, bad) {
  const t = h('div', { class: 'toast', style: bad ? 'border-color:var(--bad)' : '' }, msg);
  document.body.append(t); setTimeout(() => t.remove(), 3500);
}
export const fmt = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : String(n ?? 0));
export const when = (ts) => (ts ? new Date(ts * 1000).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '—');
export const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const copy = async (t) => { await navigator.clipboard.writeText(t); toast('Copied'); };
export const state = { accounts: [], account: +localStorage.getItem('acct') || null, status: {} };
export const tz = () => -new Date().getTimezoneOffset(); // minutes east of UTC

/** Character counter using X weighting (URLs = 23). */
export function xLen(t) { return [...t.replace(/https?:\/\/\S+/g, 'x'.repeat(23))].length; }

/** Textarea + counter widget. */
export function composer(initial = '', onInput) {
  const ta = h('textarea', { placeholder: "What's happening? (long text auto-splits into a thread)" }, initial);
  const c = h('div', { class: 'count' });
  const upd = () => { const n = xLen(ta.value); c.textContent = `${n} chars` + (n > 280 ? ` · thread of ${Math.ceil(n / 275)}` : ''); onInput?.(ta.value); };
  ta.addEventListener('input', upd); upd();
  return { ta, c, el: h('div', {}, ta, c), set(v) { ta.value = v; upd(); } };
}

export const THEMES = ['dark', 'dim', 'light'];
export function applyTheme(t = localStorage.getItem('theme') || 'dark') { document.documentElement.dataset.theme = t; localStorage.setItem('theme', t); }
applyTheme();
/** Convert a datetime-local value interpreted in an IANA timezone to unix seconds. */
export function zonedToUnix(local, zone) {
  const [d, t] = local.split('T'); const [Y, M, D] = d.split('-').map(Number); const [h, m] = t.split(':').map(Number);
  let guess = Date.UTC(Y, M - 1, D, h, m);
  for (let i = 0; i < 2; i++) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(guess)).map((p) => [p.type, p.value]));
    const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute);
    guess += Date.UTC(Y, M - 1, D, h, m) - asUtc;
  }
  return Math.floor(guess / 1000);
}
export const ZONES = (Intl.supportedValuesOf ? Intl.supportedValuesOf('timeZone') : ['UTC']);
