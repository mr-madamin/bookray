import type { EpubBook, EpubManifestItem } from './epub.types.ts';

// Maps don't survive IPC serialization reliably; manifest is flattened to a Record.
export interface SerializedEpubBook extends Omit<EpubBook, 'manifest'> {
  manifest: Record<string, EpubManifestItem>;
  coverDataUrl?: string;
}

export interface BookrayAPI {
  openFile: () => Promise<string | null>;
  loadEpub: (filePath: string) => Promise<SerializedEpubBook>;
}

declare global {
  interface Window {
    bookray: BookrayAPI;
  }
}
