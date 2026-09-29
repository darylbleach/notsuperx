import test from 'node:test';
import assert from 'node:assert/strict';
import { openNodeDb } from '../server/db.js';
import { initConfig } from '../server/config.js';
import { handle } from '../server/app.js';
import * as core from '../server/core.js';
import { handleMcp } from '../server/mcp.js';

initConfig({ APP_PASSWORD: 'pw', SESSION_SECRET: 's', BASE_URL: 'http://t' });
const mk = async () => {
  const db = await openNodeDb(':memory:');
  await db.run("INSERT INTO accounts(id,x_user_id,username) VALUES(1,'42','me')");
  return db;
};
const call = async (db, method, path, body, cookie) => {
  const req = new Request('http://t' + path, { method, body: body ? JSON.stringify(body) : undefined, headers: cookie ? { cookie } : {} });
  return handle(req, {}, db);
};
const login = async (db) => (await call(db, 'POST', '/api/login', { password: 'pw' })).headers.get('set-cookie').split(';')[0];

test('auth required, login works, wrong password rejected', async () => {
  const db = await mk();
  assert.equal((await call(db, 'GET', '/api/accounts')).status, 401);
  assert.equal((await call(db, 'POST', '/api/login', { password: 'no' })).status, 401);
  const c = await login(db);
  assert.equal((await call(db, 'GET', '/api/accounts', null, c)).status, 200);
});

test('api key auth + mcp', async () => {
  const db = await mk(); const c = await login(db);
  const { key } = await (await call(db, 'POST', '/api/keys', { name: 'k' }, c)).json();
  const r = await handle(new Request('http://t/api/accounts', { headers: { authorization: 'Bearer ' + key } }), {}, db);
  assert.equal(r.status, 200);
  const list = await handleMcp(db, { jsonrpc: '2.0', id: 1, method: 'tools/list' });
  assert.ok(list.result.tools.find((t) => t.name === 'schedule_post'));
  const res = await handleMcp(db, { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'schedule_post', arguments: { accountId: 1, text: 'hi', mode: 'draft' } } });
  assert.match(res.result.content[0].text, /draft/);
});

test('posts: thread split, validation, queue slot, draft', async () => {
  const db = await mk(); const c = await login(db);
  const long = Array.from({ length: 12 }, (_, i) => `Paragraph ${i} ` + 'word '.repeat(30)).join('\n\n');
  const r = await (await call(db, 'POST', '/api/posts', { accountId: 1, text: long, mode: 'queue' }, c)).json();
  assert.equal(r.status, 'scheduled'); assert.ok(r.thread.length >= 1);
  for (const t of [r.text, ...r.thread]) assert.ok(t.length <= 280);
  assert.ok(r.scheduled_at > core.now());
  const bad = await call(db, 'POST', '/api/posts', { accountId: 1, text: 'x'.repeat(300), autoThread: false }, c);
  assert.equal(bad.status, 400);
});

test('nextSlot honors configured slots and avoids taken ones', async () => {
  const db = await mk();
  const d = new Date(Date.now() + 864e5);
  await db.run('INSERT INTO slots(account_id,dow,hour,minute) VALUES(1,?,?,0)', d.getUTCDay(), 10);
  const a = await core.nextSlot(db, 1);
  assert.equal(new Date(a * 1000).getUTCHours(), 10);
  await db.run("INSERT INTO posts(account_id,text,status,scheduled_at) VALUES(1,'x','scheduled',?)", a);
  const b = await core.nextSlot(db, 1);
  assert.ok(b > a);
});

test('analytics + best times aggregate correctly', async () => {
  const db = await mk(); const t = core.now() - 3600;
  await db.run("INSERT INTO metrics(x_post_id,account_id,text,created_at,type,impressions,likes,replies,reposts,quotes,bookmarks) VALUES('1',1,'a',?,'text',1000,50,5,5,0,10)", t);
  const a = await core.analytics(db, 1, 7);
  assert.equal(a.impressions, 1000); assert.equal(a.engagements, 70); assert.equal(a.engagementRate, 7);
  assert.equal(a.bestTimes.length, 1);
});

test('viral library CRUD + csv export', async () => {
  const db = await mk(); const c = await login(db);
  await call(db, 'POST', '/api/viral', { text: 'great post', author: 'a', likes: 999, niche: 'saas' }, c);
  const rows = await (await call(db, 'GET', '/api/viral?niche=saas', null, c)).json();
  assert.equal(rows.length, 1);
  const csv = await (await call(db, 'GET', '/api/analytics/export.csv?account=1', null, c)).text();
  assert.match(csv, /^id,created/);
});

test('scheduled post runner marks failure without X creds', async () => {
  const db = await mk();
  await db.run("INSERT INTO posts(account_id,text,status,scheduled_at) VALUES(1,'x','scheduled',?)", core.now() - 5);
  await core.runDuePosts(db);
  assert.equal((await db.get('SELECT status FROM posts WHERE id=1')).status, 'failed');
});
