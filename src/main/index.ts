import { app, BrowserWindow, protocol } from 'electron';
import { join, extname } from 'node:path';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { setupIPC } from './ipc';
import { setupCSP } from './scp';
import { getDb } from './db/database.ts';

const isDev = !app.isPackaged;

// ── bookray:// custom scheme ──────────────────────────────────────────────────
//
// Registered before app.whenReady() — Electron requires scheme privileges to be
// declared before the browser process initialises.
//
// The scheme serves files from userData (audio tracks, and potentially other
// assets in the future). URLs take the form:
//
//   bookray:///audio/<bookId>/<uuid>.mp3
//
// The pathname (after the leading '/') is the path relative to userData.
// 'stream: true' enables partial content (Range) responses for audio seeking.

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'bookray',
    privileges: {
      standard: true,
      secure: true,
      bypassCSP: false,
      supportFetchAPI: true,
      stream: true,
    },
  },
]);

function createWindow() {
  const win = new BrowserWindow({
    width: 1480,
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

app.whenReady().then(() => {
  // Serve userData files via bookray:// with proper range-request support so
  // the audio element can seek. net.fetch against file:// ignores Range headers
  // and returns a full 200, which causes the audio element to reload from byte 0
  // on every seek. We serve bytes directly via fs.createReadStream instead.
  protocol.handle('bookray', async (request) => {
    const url = new URL(request.url);
    const relPath = url.hostname + url.pathname;
    const fullPath = join(app.getPath('userData'), relPath);

    let fileSize: number;
    try {
      fileSize = (await stat(fullPath)).size;
    } catch {
      return new Response('Not found', { status: 404 });
    }

    const ext = extname(fullPath).toLowerCase().slice(1);
    const contentTypes: Record<string, string> = {
      mp3: 'audio/mpeg', m4a: 'audio/mp4', m4b: 'audio/mp4',
      mp4: 'audio/mp4',  ogg: 'audio/ogg', flac: 'audio/flac',
      wav: 'audio/wav',  aac: 'audio/aac',
    };
    const cors = { 'Access-Control-Allow-Origin': '*', 'Accept-Ranges': 'bytes' };
    const contentType = contentTypes[ext] ?? 'application/octet-stream';

    const rangeHeader = request.headers.get('Range');
    if (rangeHeader) {
      const m = rangeHeader.match(/bytes=(\d+)-(\d*)/);
      if (!m) return new Response('Invalid range', { status: 416 });
      const start = parseInt(m[1], 10);
      const end   = m[2] ? parseInt(m[2], 10) : fileSize - 1;
      const body  = Readable.toWeb(createReadStream(fullPath, { start, end })) as ReadableStream;
      return new Response(body, {
        status: 206,
        headers: { ...cors, 'Content-Type': contentType,
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Content-Length': String(end - start + 1) },
      });
    }

    const body = Readable.toWeb(createReadStream(fullPath)) as ReadableStream;
    return new Response(body, {
      status: 200,
      headers: { ...cors, 'Content-Type': contentType, 'Content-Length': String(fileSize) },
    });
  });

  getDb(); // open + migrate before any IPC handler can run
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
