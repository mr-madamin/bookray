import { app, BrowserWindow, dialog, ipcMain, session } from 'electron';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { IPC } from '../shared/constants/ipc-channels.ts';
import { parseEpubFromZip } from './core/epub.ts';
import { parseZip } from './core/zip.ts';
import type { ZipEntry } from './core/zip.ts';
import type { EpubManifestItem } from '../shared/types/epub.types.ts';

const isDev = !app.isPackaged;

// Keyed by filePath. Populated on loadEpub; lazily populated on getChapterContent.
const zipCache = new Map<string, Map<string, ZipEntry>>();

async function getZip(filePath: string): Promise<Map<string, ZipEntry>> {
  const cached = zipCache.get(filePath);
  if (cached) return cached;
  const zip = parseZip(await readFile(filePath));
  zipCache.set(filePath, zip);
  return zip;
}

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

// ── Path helpers ─────────────────────────────────────────────────────────────

function resolveZipPath(basePath: string, href: string): string {
  let decoded = href;
  try {
    decoded = decodeURIComponent(href);
  } catch {
    /* keep original */
  }
  const dir = basePath.includes('/') ? basePath.slice(0, basePath.lastIndexOf('/')) : '';
  const combined = dir ? `${dir}/${decoded}` : decoded;
  const parts: string[] = [];
  for (const seg of combined.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') parts.pop();
    else parts.push(seg);
  }
  return parts.join('/');
}

function guessMimeType(zipPath: string): string {
  const ext = (zipPath.split('.').pop() ?? '').toLowerCase();
  const map: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    svg: 'image/svg+xml',
    webp: 'image/webp',
    woff: 'font/woff',
    woff2: 'font/woff2',
    ttf: 'font/ttf',
    otf: 'font/otf',
  };
  return map[ext] ?? 'application/octet-stream';
}

// ── Asset extraction ──────────────────────────────────────────────────────────

/**
 * Processes a CSS file's text: replaces all url() references with data: URLs.
 * Works relative to the CSS file's own ZIP path so nested paths resolve correctly.
 */
function processCssUrls(
  css: string,
  cssZipPath: string,
  zip: Map<string, ZipEntry>,
  sharedAssets: Record<string, string>,
): string {
  return css.replace(/url\(["']?([^"')]+)["']?\)/g, (match, url: string) => {
    if (url.startsWith('data:') || url.startsWith('http') || url.startsWith('//')) return match;
    const zipPath = resolveZipPath(cssZipPath, url);
    if (!sharedAssets[zipPath]) {
      const entry = zip.get(zipPath);
      if (entry) {
        sharedAssets[zipPath] = `data:${guessMimeType(zipPath)};base64,${entry.data.toString('base64')}`;
      }
    }
    return sharedAssets[zipPath] ? `url("${sharedAssets[zipPath]}")` : match;
  });
}

/**
 * Scans XHTML for src= and href= references; collects images as data: URLs
 * and CSS files as processed text (url() refs already inlined).
 */
function collectChapterAssets(
  xhtml: string,
  chapterPath: string,
  zip: Map<string, ZipEntry>,
): { assets: Record<string, string>; stylesheets: Record<string, string> } {
  const assets: Record<string, string> = {};
  const stylesheets: Record<string, string> = {};

  const RE = /(?:src|href)=["']([^"'#][^"']*)["']/g;
  let m: RegExpExecArray | null;
  while ((m = RE.exec(xhtml)) !== null) {
    const url = m[1];
    if (url.startsWith('http') || url.startsWith('data:') || url.startsWith('//')) continue;
    const zipPath = resolveZipPath(chapterPath, url);
    if (assets[zipPath] ?? stylesheets[zipPath]) continue;

    const entry = zip.get(zipPath);
    if (!entry) continue;

    if (zipPath.endsWith('.css')) {
      const cssText = entry.data.toString('utf8');
      stylesheets[zipPath] = processCssUrls(cssText, zipPath, zip, assets);
    } else {
      assets[zipPath] = `data:${guessMimeType(zipPath)};base64,${entry.data.toString('base64')}`;
    }
  }

  return { assets, stylesheets };
}

// ── IPC ───────────────────────────────────────────────────────────────────────

function setupIPC() {
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
        const coverItem = [...book.manifest.values()].find(
          (item) => item.path === book.metadata.coverPath,
        );
        const mimeType = coverItem?.mediaType ?? 'image/jpeg';
        coverDataUrl = `data:${mimeType};base64,${coverEntry.data.toString('base64')}`;
      }
    }

    return { ...book, manifest, coverDataUrl };
  });

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
