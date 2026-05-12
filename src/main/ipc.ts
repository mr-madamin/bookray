import { readFile, readdir } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { ipcMain, dialog, app } from 'electron';

import { IPC } from '../shared/constants/ipc-channels.ts';
import type { EpubManifestItem } from '../shared/types/epub.types.ts';
import type { SerializedEpubBook } from '../shared/types/api.types.ts';
import { parseEpubFromZip } from './core/epub.ts';
import { parseZip, type ZipEntry } from './core/zip.ts';
import { guessMimeType } from './utils/path.ts';
import { collectChapterAssets } from './utils/asset_extraction.ts';
import { getDb } from './db/database.ts';
import * as booksRepo from './db/repositories/books.ts';
import * as progressRepo from './db/repositories/progress.ts';
import * as audioRepo from './db/repositories/audio.ts';

// ── ZIP cache ────────────────────────────────────────────────────────────────
// Keyed by file path. Populated lazily on first access, shared between handlers.

const zipCache = new Map<string, Map<string, ZipEntry>>();

async function getZip(filePath: string): Promise<Map<string, ZipEntry>> {
  const cached = zipCache.get(filePath);
  if (cached) return cached;
  const zip = parseZip(await readFile(filePath));
  zipCache.set(filePath, zip);
  return zip;
}

// ── EPUB serialization ───────────────────────────────────────────────────────

async function serializeBook(
  filePath: string,
  fileBytes: Buffer,
): Promise<SerializedEpubBook> {
  const zip = parseZip(fileBytes);
  zipCache.set(filePath, zip);

  const raw = parseEpubFromZip(zip);

  const manifest: Record<string, EpubManifestItem> = {};
  for (const [id, item] of raw.manifest) manifest[id] = item;

  let coverDataUrl: string | undefined;
  if (raw.metadata.coverPath) {
    const entry = zip.get(raw.metadata.coverPath);
    if (entry) {
      coverDataUrl = `data:${guessMimeType(raw.metadata.coverPath)};base64,${entry.data.toString('base64')}`;
    }
  }

  return { ...raw, manifest, coverDataUrl };
}

// ── IPC handlers ─────────────────────────────────────────────────────────────

export function setupIPC() {
  // File picker dialog
  ipcMain.handle(IPC.OPEN_FILE, async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'EPUB Books', extensions: ['epub'] }],
    });
    return canceled ? null : filePaths[0];
  });

  // Import an EPUB: hash → dedup check → copy to userData → persist → return entry.
  // The zip is cached by the stored path so subsequent getChapterContent calls
  // don't re-read the file.
  ipcMain.handle(IPC.IMPORT_BOOK, async (_event, originalPath: string) => {
    const db = getDb();
    const fileBytes = await readFile(originalPath);
    const contentHash = createHash('sha256').update(fileBytes).digest('hex');

    const existing = booksRepo.findByHash(db, contentHash);
    if (existing) {
      // Ensure zip is cached by the stored path (might have been evicted)
      if (!zipCache.has(existing.filePath)) {
        const zip = parseZip(fileBytes);
        zipCache.set(existing.filePath, zip);
      }
      return existing;
    }

    const book = await serializeBook(originalPath, fileBytes);
    const id = randomUUID();
    const booksDir = join(app.getPath('userData'), 'books');

    const entry = await booksRepo.createBook(db, id, originalPath, booksDir, contentHash, book);

    // Cache by the new stored path
    const zip = zipCache.get(originalPath);
    if (zip) zipCache.set(entry.filePath, zip);

    return entry;
  });

  // Load persisted library on startup — no EPUB parsing, just DB reads.
  ipcMain.handle(IPC.LOAD_LIBRARY, () => {
    return booksRepo.getAllBooks(getDb());
  });

  // Return the parsed chapter HTML + inlined assets.
  ipcMain.handle(
    IPC.GET_CHAPTER_CONTENT,
    async (_event, filePath: string, chapterPath: string) => {
      const zip = await getZip(filePath);
      const entry = zip.get(chapterPath);
      if (!entry) throw new Error(`Chapter not found in archive: ${chapterPath}`);

      const xhtml = entry.data.toString('utf8');
      const { assets, stylesheets } = collectChapterAssets(xhtml, chapterPath, zip);
      return { xhtml, assets, stylesheets };
    },
  );

  // Reading progress — synchronous DB calls, no async needed.
  ipcMain.handle(IPC.PROGRESS_GET, (_event, bookId: string) => {
    return progressRepo.getProgress(getDb(), bookId);
  });

  ipcMain.handle(
    IPC.PROGRESS_SET,
    (_event, bookId: string, chapterPath: string, pageFraction: number) => {
      progressRepo.setProgress(getDb(), bookId, chapterPath, pageFraction);
    },
  );

  // ── Audio ──────────────────────────────────────────────────────────────────

  ipcMain.handle(IPC.AUDIO_GET_TRACKS, (_event, bookId: string) => {
    return audioRepo.getTracks(getDb(), bookId);
  });

  // Opens a directory picker, copies every audio file found to
  // userData/audio/<bookId>/, inserts rows, and returns AudioTrack[].
  ipcMain.handle(IPC.AUDIO_IMPORT_FOLDER, async (_event, bookId: string) => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: 'Select audiobook folder',
    });
    if (canceled || filePaths.length === 0) return [];

    const folderPath = filePaths[0];
    const entries = await readdir(folderPath, { withFileTypes: true });

    const audioFiles = entries
      .filter(
        (e) =>
          e.isFile() &&
          audioRepo.AUDIO_EXTENSIONS.has(extname(e.name).toLowerCase()),
      )
      .map((e) => join(folderPath, e.name))
      // Natural sort: "02 - Chapter.mp3" before "10 - Chapter.mp3"
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

    if (audioFiles.length === 0) return [];

    const audioBaseDir = join(app.getPath('userData'), 'audio');
    return audioRepo.importTracks(getDb(), bookId, audioBaseDir, audioFiles);
  });

  ipcMain.handle(
    IPC.AUDIO_UPDATE_DURATION,
    (_event, trackId: string, duration: number) => {
      audioRepo.updateDuration(getDb(), trackId, duration);
    },
  );
}
