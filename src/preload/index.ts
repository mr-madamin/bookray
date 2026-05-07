import { contextBridge, ipcRenderer, webUtils } from 'electron';

// Channel names must stay in sync with src/shared/constants/ipc-channels.ts.
// The preload is compiled by its own tsc project (no bundler), so path aliases
// aren't rewritten in the output — inline constants are safer here.
const OPEN_FILE = 'bookray:open-file';
const LOAD_EPUB = 'bookray:load-epub';
const GET_CHAPTER_CONTENT = 'bookray:get-chapter-content';

contextBridge.exposeInMainWorld('bookray', {
  openFile: (): Promise<string | null> => ipcRenderer.invoke(OPEN_FILE),
  loadEpub: (filePath: string) => ipcRenderer.invoke(LOAD_EPUB, filePath),
  getChapterContent: (filePath: string, chapterPath: string) =>
    ipcRenderer.invoke(GET_CHAPTER_CONTENT, filePath, chapterPath),
  getFilePath: (file: File): string => webUtils.getPathForFile(file),
});
