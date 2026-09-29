// Async DB adapter. Same interface over Cloudflare D1 (prod) and node:sqlite (local dev / tests).
// all(sql,...args) -> rows[]; get(...) -> row|undefined; run(...) -> {changes,lastId}; exec(sqlText)

export function wrapD1(d1) {
  const bind = (sql, args) => d1.prepare(sql).bind(...args.map((a) => (a === undefined ? null : a)));
  return {
    kind: 'd1',
    async all(sql, ...a) { return (await bind(sql, a).all()).results; },
    async get(sql, ...a) { return (await bind(sql, a).first()) ?? undefined; },
    async run(sql, ...a) { const r = await bind(sql, a).run(); return { changes: r.meta.changes, lastId: r.meta.last_row_id }; },
    async exec(text) { for (const s of text.split(/;\s*\n/).map((x) => x.trim()).filter(Boolean)) await d1.prepare(s).run(); },
  };
}

export async function openNodeDb(file = ':memory:') {
  const { DatabaseSync } = await import('node:sqlite');
  const fs = await import('node:fs'), path = await import('node:path');
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys=ON;');
  const norm = (a) => a.map((x) => (x === undefined ? null : x));
  const w = {
    kind: 'node',
    async all(sql, ...a) { return db.prepare(sql).all(...norm(a)); },
    async get(sql, ...a) { return db.prepare(sql).get(...norm(a)); },
    async run(sql, ...a) { const r = db.prepare(sql).run(...norm(a)); return { changes: Number(r.changes), lastId: Number(r.lastInsertRowid) }; },
    async exec(text) { db.exec(text); },
  };
  // apply migrations
  for (const f of fs.readdirSync(new URL('../migrations/', import.meta.url)).sort()) {
    db.exec(fs.readFileSync(new URL(`../migrations/${f}`, import.meta.url), 'utf8'));
  }
  return w;
}

export const kvGet = async (db, k, d = null) => {
  const r = await db.get('SELECT v FROM kv WHERE k=?', k);
  return r ? JSON.parse(r.v) : d;
};
export const kvSet = (db, k, v) =>
  db.run('INSERT INTO kv(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v', k, JSON.stringify(v));
export const kvDel = (db, k) => db.run('DELETE FROM kv WHERE k=?', k);
