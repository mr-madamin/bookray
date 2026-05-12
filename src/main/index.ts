import { app, BrowserWindow, protocol, net } from 'electron';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
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
  // Serve userData files via bookray:// with CORS headers so the renderer's
  // Web Audio API (createMediaElementSource) can access them cross-origin.
  protocol.handle('bookray', async (request) => {
    const url = new URL(request.url);
    // pathname starts with '/', e.g. '/audio/bookId/track.mp3'
    const relPath = url.pathname.slice(1);
    const fullPath = join(app.getPath('userData'), relPath);
    const fileUrl = pathToFileURL(fullPath).toString();

    const fetchHeaders: Record<string, string> = {};
    const range = request.headers.get('Range');
    if (range) fetchHeaders['Range'] = range;

    const resp = await net.fetch(fileUrl, { headers: fetchHeaders });
    const headers = new Headers(resp.headers);
    headers.set('Access-Control-Allow-Origin', '*');

    return new Response(resp.body, {
      status: resp.status,
      statusText: resp.statusText,
      headers,
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
