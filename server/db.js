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

export const kvGet = async (db, k, d = null) => {
  const r = await db.get('SELECT v FROM kv WHERE k=?', k);
  return r ? JSON.parse(r.v) : d;
};
export const kvSet = (db, k, v) =>
  db.run('INSERT INTO kv(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v', k, JSON.stringify(v));
export const kvDel = (db, k) => db.run('DELETE FROM kv WHERE k=?', k);
