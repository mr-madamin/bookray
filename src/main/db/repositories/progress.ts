import type { DB } from '../database.ts';
import type { ProgressRecord } from '@shared/types';

interface ProgressRow {
  book_id: string;
  chapter_path: string;
  page_fraction: number;
  updated_at: number;
}

export function getProgress(db: DB, bookId: string): ProgressRecord | null {
  const row = db
    .prepare('SELECT * FROM reading_progress WHERE book_id = ?')
    .get(bookId) as ProgressRow | undefined;
  if (!row) return null;
  return { chapterPath: row.chapter_path, pageFraction: row.page_fraction };
}

export function setProgress(
  db: DB,
  bookId: string,
  chapterPath: string,
  pageFraction: number,
): void {
  db.prepare(
    `INSERT INTO reading_progress (book_id, chapter_path, page_fraction, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(book_id) DO UPDATE SET
       chapter_path  = excluded.chapter_path,
       page_fraction = excluded.page_fraction,
       updated_at    = excluded.updated_at`,
  ).run(bookId, chapterPath, pageFraction, Date.now());
}
