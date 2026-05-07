import { readFile } from 'node:fs/promises';
import { ipcMain, dialog } from 'electron';

import { IPC } from '../shared/constants/ipc-channels.ts';
import type { EpubManifestItem } from '../shared/types/epub.types.ts';
import { parseEpubFromZip } from './core/epub.ts';
import { parseZip, type ZipEntry } from './core/zip.ts';
import { guessMimeType } from './utils/path.ts';
import { collectChapterAssets } from './utils/asset_extraction.ts';

// Keyed by filePath. Populated on loadEpub; lazily populated on getChapterContent.
const zipCache = new Map<string, Map<string, ZipEntry>>();

async function getZip(filePath: string): Promise<Map<string, ZipEntry>> {
  const cached = zipCache.get(filePath);
  if (cached) return cached;
  const zip = parseZip(await readFile(filePath));
  zipCache.set(filePath, zip);
  return zip;
}

export function setupIPC() {
  ipcMain.handle(IPC.OPEN_FILE, async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'EPUB Books', extensions: ['epub'] }],
    });
    return canceled ? null : filePaths[0];
  });

  ipcMain.handle(IPC.LOAD_EPUB, async (_event, filePath: string) => {
    const zip = await getZip(filePath);
    const book = parseEpubFromZip(zip);

    const manifest: Record<string, EpubManifestItem> = {};
    for (const [id, item] of book.manifest) {
      manifest[id] = item;
    }

    let coverDataUrl: string | undefined;
    if (book.metadata.coverPath) {
      const coverEntry = zip.get(book.metadata.coverPath);
      if (coverEntry) {
        coverDataUrl = `data:${guessMimeType(book.metadata.coverPath)};base64,${coverEntry.data.toString('base64')}`;
      }
    }

    return { ...book, manifest, coverDataUrl };
  });

  ipcMain.handle(
    IPC.GET_CHAPTER_CONTENT,
    async (_event, filePath: string, chapterPath: string) => {
      const zip = await getZip(filePath);
      const entry = zip.get(chapterPath);
      if (!entry)
        throw new Error(`Chapter not found in archive: ${chapterPath}`);

      const xhtml = entry.data.toString('utf8');
      const { assets, stylesheets } = collectChapterAssets(
        xhtml,
        chapterPath,
        zip,
      );
      return { xhtml, assets, stylesheets };
    },
  );
}
