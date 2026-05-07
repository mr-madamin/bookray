import type { ZipEntry } from '../core/zip.ts';
import { guessMimeType, resolveZipPath } from './path.ts';

/**
 * Processes a CSS file's text: replaces all url() references with data: URLs.
 * Works relative to the CSS file's own ZIP path so nested paths resolve correctly.
 */
export function processCssUrls(
  css: string,
  cssZipPath: string,
  zip: Map<string, ZipEntry>,
  sharedAssets: Record<string, string>,
): string {
  return css.replace(/url\(["']?([^"')]+)["']?\)/g, (match, url: string) => {
    if (
      url.startsWith('data:') ||
      url.startsWith('http') ||
      url.startsWith('//')
    )
      return match;
    const zipPath = resolveZipPath(cssZipPath, url);
    if (!sharedAssets[zipPath]) {
      const entry = zip.get(zipPath);
      if (entry) {
        sharedAssets[zipPath] =
          `data:${guessMimeType(zipPath)};base64,${entry.data.toString('base64')}`;
      }
    }
    return sharedAssets[zipPath] ? `url("${sharedAssets[zipPath]}")` : match;
  });
}

/**
 * Scans XHTML for src= and href= references; collects images as data: URLs
 * and CSS files as processed text (url() refs already inlined).
 */
export function collectChapterAssets(
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
    if (
      url.startsWith('http') ||
      url.startsWith('data:') ||
      url.startsWith('//')
    )
      continue;
    const zipPath = resolveZipPath(chapterPath, url);
    if (assets[zipPath] ?? stylesheets[zipPath]) continue;

    const entry = zip.get(zipPath);
    if (!entry) continue;

    if (zipPath.endsWith('.css')) {
      const cssText = entry.data.toString('utf8');
      stylesheets[zipPath] = processCssUrls(cssText, zipPath, zip, assets);
    } else {
      assets[zipPath] =
        `data:${guessMimeType(zipPath)};base64,${entry.data.toString('base64')}`;
    }
  }

  return { assets, stylesheets };
}
