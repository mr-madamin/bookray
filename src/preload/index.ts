import { contextBridge, ipcRenderer, webUtils } from 'electron';

// Channel names must stay in sync with src/shared/constants/ipc-channels.ts.
// The preload is compiled by its own tsc project (no bundler), so path aliases
// aren't rewritten — inline constants are safer here.
const OPEN_FILE           = 'bookray:open-file';
const IMPORT_BOOK         = 'bookray:import-book';
const LOAD_LIBRARY        = 'bookray:load-library';
const GET_CHAPTER_CONTENT = 'bookray:get-chapter-content';
const PROGRESS_GET        = 'bookray:progress-get';
const PROGRESS_SET        = 'bookray:progress-set';

contextBridge.exposeInMainWorld('bookray', {
  openFile:   (): Promise<string | null> => ipcRenderer.invoke(OPEN_FILE),
  importBook: (originalPath: string)     => ipcRenderer.invoke(IMPORT_BOOK, originalPath),
  loadLibrary: ()                        => ipcRenderer.invoke(LOAD_LIBRARY),
  getChapterContent: (filePath: string, chapterPath: string) =>
    ipcRenderer.invoke(GET_CHAPTER_CONTENT, filePath, chapterPath),
  progressGet: (bookId: string) =>
    ipcRenderer.invoke(PROGRESS_GET, bookId),
  progressSet: (bookId: string, chapterPath: string, pageFraction: number) =>
    ipcRenderer.invoke(PROGRESS_SET, bookId, chapterPath, pageFraction),
  getFilePath: (file: File): string => webUtils.getPathForFile(file),
});
