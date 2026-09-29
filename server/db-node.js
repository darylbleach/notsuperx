// Node-only SQLite adapter (local dev, VPS, tests). Not imported by the Worker.
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
export async function openNodeDb(file = ':memory:') {
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

