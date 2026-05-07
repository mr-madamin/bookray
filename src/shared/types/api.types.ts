import type { EpubBook, EpubManifestItem } from './epub.types.ts';

// Maps don't survive IPC serialization reliably; manifest is flattened to a Record.
export interface SerializedEpubBook extends Omit<EpubBook, 'manifest'> {
  manifest: Record<string, EpubManifestItem>;
  coverDataUrl?: string;
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
  loadEpub: (filePath: string) => Promise<SerializedEpubBook>;
  getChapterContent: (filePath: string, chapterPath: string) => Promise<ChapterContent>;
  getFilePath: (file: File) => string;
}

declare global {
  interface Window {
    bookray: BookrayAPI;
  }
}
