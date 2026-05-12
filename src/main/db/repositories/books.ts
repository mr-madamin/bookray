import { copyFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { DB } from '../database.ts';
import type { LibraryEntry, SerializedEpubBook } from '@shared/types';

interface BookRow {
  id: string;
  file_path: string;
  content_hash: string;
  book_data: string;
  cover_data_url: string | null;
  title: string;
  authors: string;
  added_at: number;
}

function rowToEntry(row: BookRow): LibraryEntry {
  const bookData = JSON.parse(row.book_data) as Omit<SerializedEpubBook, 'coverDataUrl'>;
  return {
    id: row.id,
    filePath: row.file_path,
    book: { ...bookData, coverDataUrl: row.cover_data_url ?? undefined },
  };
}

export function getAllBooks(db: DB): LibraryEntry[] {
  const rows = db
    .prepare('SELECT * FROM books ORDER BY added_at DESC')
    .all() as BookRow[];
  return rows.map(rowToEntry);
}

export function findByHash(db: DB, hash: string): LibraryEntry | null {
  const row = db
    .prepare('SELECT * FROM books WHERE content_hash = ?')
    .get(hash) as BookRow | undefined;
  return row ? rowToEntry(row) : null;
}

export async function createBook(
  db: DB,
  id: string,
  originalPath: string,
  booksDir: string,
  contentHash: string,
  book: SerializedEpubBook,
): Promise<LibraryEntry> {
  await mkdir(booksDir, { recursive: true });

  const destPath = join(booksDir, `${id}.epub`);
  await copyFile(originalPath, destPath);

  // coverDataUrl is stored in its own column — it can be large (base64 image)
  // and we don't want it mixed into the book_data JSON blob.
  const { coverDataUrl, ...bookWithoutCover } = book;

  db.prepare(
    `INSERT INTO books
       (id, file_path, content_hash, book_data, cover_data_url, title, authors, added_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    destPath,
    contentHash,
    JSON.stringify(bookWithoutCover),
    coverDataUrl ?? null,
    book.metadata.title,
    JSON.stringify(book.metadata.authors),
    Date.now(),
  );

  return { id, filePath: destPath, book };
}

// Returns the deleted book's file_path so the caller can clean up the file.
export function deleteBook(db: DB, id: string): string | null {
  const row = db
    .prepare('SELECT file_path FROM books WHERE id = ?')
    .get(id) as Pick<BookRow, 'file_path'> | undefined;
  if (!row) return null;
  db.prepare('DELETE FROM books WHERE id = ?').run(id);
  return row.file_path;
}
