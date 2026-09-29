#!/usr/bin/env node
// notsuperx CLI. Config: NSX_URL, NSX_KEY (create a key in Settings → API keys)
const URL_ = (process.env.NSX_URL || 'http://localhost:8787').replace(/\/$/, ''), KEY = process.env.NSX_KEY || '';
const [cmd, ...args] = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const text = () => args.filter((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--')).join(' ');
async function api(path, body, method) {
  const r = await fetch(URL_ + '/api' + path, { method: method || (body ? 'POST' : 'GET'), headers: { 'content-type': 'application/json', authorization: 'Bearer ' + KEY }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({})); if (!r.ok) { console.error('Error:', j.error || r.status); process.exit(1); } return j;
}
const acct = async () => +flag('account') || (await api('/accounts'))[0]?.id;
const help = `notsuperx <command>
  accounts                          list accounts
  post "text" [--now|--queue|--at <iso>] [--account id]
  queue                             scheduled posts
  analytics [--days 30]
  ai posts|thread|rewrite "topic"
  sync                              refresh analytics
  mcp                               print MCP endpoint config`;
const out = (x) => console.log(typeof x === 'string' ? x : JSON.stringify(x, null, 2));
switch (cmd) {
  case 'accounts': out(await api('/accounts')); break;
  case 'post': { const mode = args.includes('--now') ? 'now' : flag('at') ? 'schedule' : args.includes('--queue') ? 'queue' : 'draft';
    out(await api('/posts', { accountId: await acct(), text: text(), mode, scheduledAt: flag('at') ? Math.floor(Date.parse(flag('at')) / 1000) : undefined })); break; }
  case 'queue': out((await api(`/posts?account=${await acct()}&status=scheduled`)).map((p) => `${new Date(p.scheduled_at * 1000).toISOString()}  ${p.text.slice(0, 80)}`).join('\n')); break;
  case 'analytics': { const { daily, heatmap, followerSeries, top, byType, bestTimes, ...s } = await api(`/analytics?account=${await acct()}&days=${flag('days', 30)}`); out(s); break; }
  case 'ai': { const kind = args.shift(); const t = text(); out((await api('/ai/' + kind, kind === 'rewrite' ? { text: t } : { topic: t })).result); break; }
  case 'sync': out(await api(`/accounts/${await acct()}/sync`, {})); break;
  case 'mcp': out({ mcpServers: { notsuperx: { type: 'http', url: URL_ + '/mcp', headers: { Authorization: 'Bearer ' + (KEY || '<key>') } } } }); break;
  default: console.log(help);
}
