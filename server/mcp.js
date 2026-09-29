// Minimal MCP server (Streamable HTTP, JSON responses). Auth: Bearer API key. Endpoint: POST /mcp
import * as core from './core.js';
import { ai } from './ai.js';
import { kvGet } from './db.js';
import * as I from './insights.js';

const S = (props, req = []) => ({ type: 'object', properties: props, required: req });
const str = { type: 'string' }, num = { type: 'number' };

const tools = {
  list_accounts: { d: 'List connected X accounts', s: S({}), run: (db) => db.all('SELECT id,username,name,followers FROM accounts') },
  schedule_post: {
    d: 'Create a post. mode: draft|schedule|queue|now. Threads auto-split.',
    s: S({ accountId: num, text: str, mode: str, scheduledAt: { type: 'number', description: 'unix seconds (mode=schedule)' } }, ['accountId', 'text']),
    async run(db, a) {
      const parts = core.splitThread(a.text); const mode = a.mode || 'queue';
      const at = mode === 'schedule' ? a.scheduledAt : mode === 'queue' ? await core.nextSlot(db, a.accountId) : mode === 'now' ? core.now() : null;
      const res = await db.run('INSERT INTO posts(account_id,text,thread,status,scheduled_at,kind) VALUES(?,?,?,?,?,?)',
        a.accountId, parts[0], JSON.stringify(parts.slice(1)), mode === 'draft' ? 'draft' : 'scheduled', at, parts.length > 1 ? 'thread' : 'post');
      if (mode === 'now') await core.runDuePosts(db);
      return db.get('SELECT id,status,scheduled_at,x_post_id FROM posts WHERE id=?', res.lastId);
    },
  },
  list_posts: { d: 'List posts by status', s: S({ accountId: num, status: str }), run: (db, a) => db.all('SELECT id,text,status,scheduled_at,x_post_id FROM posts WHERE (?1 IS NULL OR account_id=?1) AND (?2 IS NULL OR status=?2) ORDER BY id DESC LIMIT 50', a.accountId ?? null, a.status ?? null) },
  analytics: { d: 'Account analytics summary', s: S({ accountId: num, days: num }, ['accountId']), run: async (db, a) => { const { daily, heatmap, byType, followerSeries, top, ...sum } = await core.analytics(db, a.accountId, a.days || 30); return { ...sum, top: top.slice(0, 3).map((t) => t.text) }; } },
  generate_posts: { d: 'AI: generate posts in saved voice', s: S({ topic: str, count: num }, ['topic']), run: async (db, a) => ai.posts(db, { ...a, voice: await kvGet(db, 'voice', '') }) },
  generate_thread: { d: 'AI: generate a thread', s: S({ topic: str, length: num }, ['topic']), run: async (db, a) => ai.thread(db, { ...a, voice: await kvGet(db, 'voice', '') }) },
  rewrite_post: { d: 'AI: rewrite a post', s: S({ text: str, tone: str }, ['text']), run: async (db, a) => ai.rewrite(db, { ...a, voice: await kvGet(db, 'voice', '') }) },
  tweet_test: { d: 'Score a draft post 0-100 vs your own baseline', s: S({ accountId: num, text: str }, ['accountId', 'text']), run: (db, a) => I.tweetTest(db, a.accountId, a.text) },
  ai_shield: { d: 'Estimate whether a reply is AI-generated', s: S({ text: str }, ['text']), run: async (_db, a) => I.aiShield(a.text) },
  search_viral: { d: 'Search your saved viral library', s: S({ q: str, niche: str }), run: (db, a) => db.all('SELECT text,author,likes,niche FROM viral WHERE text LIKE ? AND niche LIKE ? ORDER BY likes DESC LIMIT 25', `%${a.q || ''}%`, `%${a.niche || ''}%`) },
  best_times: { d: 'Best posting times (UTC) from your data + audience activity', s: S({ accountId: num }, ['accountId']), run: async (db, a) => (await core.bestTimes(db, a.accountId)).slice(0, 8) },
  sync_account: { d: 'Refresh analytics from X', s: S({ accountId: num }, ['accountId']), run: (db, a) => core.syncAccount(db, a.accountId) },
};

export async function handleMcp(db, msg) {
  const ok = (result) => ({ jsonrpc: '2.0', id: msg.id, result });
  const err = (code, message) => ({ jsonrpc: '2.0', id: msg.id, error: { code, message } });
  switch (msg.method) {
    case 'initialize': return ok({ protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'notsuperx', version: '1.0.0' } });
    case 'notifications/initialized': return {};
    case 'ping': return ok({});
    case 'tools/list': return ok({ tools: Object.entries(tools).map(([name, t]) => ({ name, description: t.d, inputSchema: t.s })) });
    case 'tools/call': {
      const t = tools[msg.params?.name];
      if (!t) return err(-32602, 'Unknown tool');
      try { return ok({ content: [{ type: 'text', text: JSON.stringify(await t.run(db, msg.params.arguments || {}), null, 2) }] }); }
      catch (e) { return ok({ isError: true, content: [{ type: 'text', text: e.message }] }); }
    }
    default: return err(-32601, 'Method not found');
  }
}
