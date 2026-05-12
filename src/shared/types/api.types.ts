import type { EpubBook, EpubManifestItem } from './epub.types.ts';

// Maps don't survive IPC serialization reliably; manifest is flattened to a Record.
export interface SerializedEpubBook extends Omit<EpubBook, 'manifest'> {
  manifest: Record<string, EpubManifestItem>;
  coverDataUrl?: string;
}

// A book in the persisted library. Also used as the renderer's LibraryBook.
export interface LibraryEntry {
  id: string;
  filePath: string;
  book: SerializedEpubBook;
}

export interface ProgressRecord {
  chapterPath: string;
  pageFraction: number;
}

export interface ChapterContent {
  /** Raw XHTML from the ZIP. Assets not yet inlined — the renderer handles that. */
  xhtml: string;
  /** Binary assets (images, fonts) keyed by ZIP path → data: URL. */
  assets: Record<string, string>;
  /**
   * CSS file contents keyed by ZIP path → raw CSS text.
   * url() references inside the CSS have already been replaced with data: URLs
   * by the main process (relative to each CSS file's own ZIP path).
   */
  stylesheets: Record<string, string>;
}

export interface BookrayAPI {
  openFile: () => Promise<string | null>;
  importBook: (originalPath: string) => Promise<LibraryEntry>;
  loadLibrary: () => Promise<LibraryEntry[]>;
  getChapterContent: (filePath: string, chapterPath: string) => Promise<ChapterContent>;
  progressGet: (bookId: string) => Promise<ProgressRecord | null>;
  progressSet: (bookId: string, chapterPath: string, pageFraction: number) => Promise<void>;
  getFilePath: (file: File) => string;
}

declare global {
  interface Window {
    bookray: BookrayAPI;
  }
}
