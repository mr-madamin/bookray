import { app } from 'electron';
import { join } from 'node:path';
import Database from 'better-sqlite3';

import { MIGRATIONS } from './schema.ts';

// Exported so repositories can type their `db` parameter without importing
// the full better-sqlite3 module.
export type DB = InstanceType<typeof Database>;

let _db: DB | null = null;

export function getDb(): DB {
  if (_db) return _db;

  const dbPath = join(app.getPath('userData'), 'bookray.db');
  _db = new Database(dbPath);

  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');

  runMigrations(_db);
  return _db;
}

export function closeDb(): void {
  _db?.close();
  _db = null;
}

// ── Migrations ───────────────────────────────────────────────────────────────
//
// user_version is a PRAGMA that SQLite persists in the DB header — it's 0 for
// new databases. Each migration runs in its own transaction; user_version is
// bumped immediately after so a crash mid-migration doesn't leave a corrupt
// half-applied state. On the next startup the migration retries cleanly.

function runMigrations(db: DB): void {
  const current = db.pragma('user_version', { simple: true }) as number;

  for (let v = current; v < MIGRATIONS.length; v++) {
    db.transaction(() => db.exec(MIGRATIONS[v]))();
    db.pragma(`user_version = ${v + 1}`);
  }
}
