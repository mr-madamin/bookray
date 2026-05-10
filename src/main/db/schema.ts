// Each string in MIGRATIONS is executed atomically in database.ts.
// To add a schema change: append a new string — never edit existing ones.
// user_version (SQLite PRAGMA) tracks how many have been applied.

export const MIGRATIONS: string[] = [
  // v0 → v1: initial schema
  `
  CREATE TABLE IF NOT EXISTS books (
    id              TEXT    PRIMARY KEY,
    file_path       TEXT    NOT NULL UNIQUE,
    content_hash    TEXT    NOT NULL,
    book_data       TEXT    NOT NULL,
    cover_data_url  TEXT,
    title           TEXT    NOT NULL,
    authors         TEXT    NOT NULL,
    added_at        INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS reading_progress (
    book_id       TEXT    PRIMARY KEY REFERENCES books(id) ON DELETE CASCADE,
    chapter_path  TEXT    NOT NULL,
    page_fraction REAL    NOT NULL DEFAULT 0,
    updated_at    INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS bookmarks (
    id            TEXT    PRIMARY KEY,
    book_id       TEXT    NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    chapter_path  TEXT    NOT NULL,
    page_fraction REAL    NOT NULL,
    label         TEXT,
    created_at    INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_bookmarks_book_id ON bookmarks(book_id);
  `,
];
