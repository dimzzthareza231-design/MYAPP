// Node-only stand-in for D1 (dev server and tests). Never imported by the Worker bundle.
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import type { D1Database } from './db';

type Value = string | number | null | bigint | Uint8Array;

class Statement {
  constructor(private db: DatabaseSync, private sql: string, private params: Value[] = []) {}
  bind(...params: unknown[]) {
    return new Statement(this.db, this.sql, params.map((p) => (p === undefined ? null : typeof p === 'boolean' ? Number(p) : p)) as Value[]);
  }
  async all<T = Record<string, unknown>>() {
    return { results: this.db.prepare(this.sql).all(...this.params) as T[], success: true, meta: {} };
  }
  async first<T = Record<string, unknown>>(col?: string) {
    const row = this.db.prepare(this.sql).get(...this.params) as Record<string, unknown> | undefined;
    if (!row) return null;
    return (col ? row[col] : row) as T;
  }
  async run() {
    const r = this.db.prepare(this.sql).run(...this.params);
    return { results: [], success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
  }
  async raw<T = unknown[]>() {
    const s = this.db.prepare(this.sql);
    s.setReturnArrays(true);
    return s.all(...this.params) as T[];
  }
  runSync() {
    return this.db.prepare(this.sql).run(...this.params);
  }
}

// file ':memory:' gives a throwaway DB (tests). Migrations from migrationsDir are applied once, like wrangler does.
export function openLocalD1(file: string, migrationsDir: string): D1Database {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON; CREATE TABLE IF NOT EXISTS d1_migrations (name TEXT PRIMARY KEY, applied_at TEXT DEFAULT (datetime(\'now\')))');
  const done = new Set((db.prepare('SELECT name FROM d1_migrations').all() as { name: string }[]).map((r) => r.name));
  for (const name of fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()) {
    if (done.has(name)) continue;
    db.exec('BEGIN');
    try {
      db.exec(fs.readFileSync(path.join(migrationsDir, name), 'utf8'));
      db.prepare('INSERT INTO d1_migrations (name) VALUES (?)').run(name);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  }

  const d1 = {
    prepare: (sql: string) => new Statement(db, sql),
    async batch(stmts: Statement[]) {
      db.exec('BEGIN');
      try {
        const out = [];
        for (const s of stmts) out.push(await s.run());
        db.exec('COMMIT');
        return out;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
    async exec(sql: string) {
      db.exec(sql);
      return { count: 0, duration: 0 };
    },
  };
  return d1 as unknown as D1Database;
}

export function openLocalDatabases(dir = '.wrangler/node-dev') {
  const open = (name: 'core' | 'hr' | 'public') =>
    openLocalD1(dir === ':memory:' ? ':memory:' : path.join(dir, `${name}.sqlite`), path.join('migrations', name));
  return { core: open('core'), hr: open('hr'), public: open('public') };
}
