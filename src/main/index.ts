import { app, BrowserWindow, dialog, ipcMain, session } from 'electron';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { IPC } from '../shared/constants/ipc-channels.ts';
import { parseEpub } from './core/epub.ts';
import type { EpubManifestItem } from '../shared/types/epub.types.ts';

const isDev = !app.isPackaged;

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    win.loadURL('http://localhost:5173');
    win.webContents.openDevTools();
    process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true';
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

function setupCSP() {
  const cspDev = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self' http://localhost:5173 ws://localhost:5173",
  ].join('; ');

  const cspProd = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
  ].join('; ');

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [isDev ? cspDev : cspProd],
      },
    });
  });
}

function setupIPC() {
  ipcMain.handle(IPC.OPEN_FILE, async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'EPUB Books', extensions: ['epub'] }],
    });
    return canceled ? null : filePaths[0];
  });

  ipcMain.handle(IPC.LOAD_EPUB, async (_event, filePath: string) => {
    const buffer = await readFile(filePath);
    const book = parseEpub(buffer);
    const manifest: Record<string, EpubManifestItem> = {};
    for (const [id, item] of book.manifest) {
      manifest[id] = item;
    }
    return { ...book, manifest };
  });
}

app.whenReady().then(() => {
  setupCSP();
  setupIPC();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
