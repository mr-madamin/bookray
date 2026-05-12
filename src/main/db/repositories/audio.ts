import { copyFile, mkdir } from 'node:fs/promises';
import { join, basename, extname } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { DB } from '../database.ts';
import type { AudioTrack } from '@shared/types';

export const AUDIO_EXTENSIONS = new Set(['.mp3', '.m4a', '.m4b', '.ogg', '.flac', '.wav']);

interface AudioRow {
  id: string;
  book_id: string;
  rel_path: string;
  track_index: number;
  title: string | null;
  duration: number | null;
  added_at: number;
}

function rowToTrack(row: AudioRow): AudioTrack {
  return {
    id: row.id,
    bookId: row.book_id,
    // rel_path is relative to userData, served via the bookray:// scheme
    url: `bookray:///${row.rel_path}`,
    trackIndex: row.track_index,
    title: row.title,
    duration: row.duration,
  };
}

export function getTracks(db: DB, bookId: string): AudioTrack[] {
  const rows = db
    .prepare('SELECT * FROM audio_tracks WHERE book_id = ? ORDER BY track_index')
    .all(bookId) as AudioRow[];
  return rows.map(rowToTrack);
}

// Copies audio files to userData/audio/<bookId>/ and inserts DB rows.
// New tracks are appended after any that already exist.
export async function importTracks(
  db: DB,
  bookId: string,
  audioBaseDir: string, // app.getPath('userData') + '/audio'
  srcPaths: string[],
): Promise<AudioTrack[]> {
  const destDir = join(audioBaseDir, bookId);
  await mkdir(destDir, { recursive: true });

  // Start index after any existing tracks so re-import appends cleanly.
  const maxRow = db
    .prepare('SELECT MAX(track_index) AS max FROM audio_tracks WHERE book_id = ?')
    .get(bookId) as { max: number | null };
  const startIndex = (maxRow.max ?? -1) + 1;

  const records = srcPaths.map((srcPath, i) => {
    const origName = basename(srcPath);
    const ext = extname(origName).toLowerCase();
    const title = origName.slice(0, -ext.length);
    const id = randomUUID();
    const filename = `${id}${ext}`;
    const relPath = `audio/${bookId}/${filename}`;
    return {
      id,
      bookId,
      relPath,
      trackIndex: startIndex + i,
      title,
      srcPath,
      destPath: join(destDir, filename),
    };
  });

  // Copy files first (outside transaction — IO shouldn't block SQLite WAL writer).
  await Promise.all(records.map((r) => copyFile(r.srcPath, r.destPath)));

  // Insert all rows in a single transaction.
  const insert = db.prepare(
    `INSERT INTO audio_tracks (id, book_id, rel_path, track_index, title, added_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  db.transaction(() => {
    for (const r of records) {
      insert.run(r.id, r.bookId, r.relPath, r.trackIndex, r.title, Date.now());
    }
  })();

  return records.map((r) => ({
    id: r.id,
    bookId: r.bookId,
    url: `bookray:///${r.relPath}`,
    trackIndex: r.trackIndex,
    title: r.title,
    duration: null,
  }));
}

export function updateDuration(db: DB, trackId: string, duration: number): void {
  db.prepare('UPDATE audio_tracks SET duration = ? WHERE id = ?').run(duration, trackId);
}
