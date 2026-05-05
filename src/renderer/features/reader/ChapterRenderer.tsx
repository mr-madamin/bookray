import { useEffect, useRef, useState } from 'react';
import type { LibraryBook } from '../library/library.store';

// ── Types ────────────────────────────────────────────────────────────────────

interface ReaderSettings {
  fontSize: number;
  lineHeight: number;
}

const DEFAULT_SETTINGS: ReaderSettings = { fontSize: 17, lineHeight: 1.75 };

// ── Theme CSS injected into the iframe ───────────────────────────────────────

function buildThemeCSS({ fontSize, lineHeight }: ReaderSettings): string {
  return `
    *, *::before, *::after { box-sizing: border-box; }
    html { background: #0f172a !important; }
    body {
      background: #0f172a !important;
      color: #cbd5e1 !important;
      font-size: ${fontSize}px !important;
      line-height: ${lineHeight} !important;
      font-family: Georgia, 'Times New Roman', serif;
      max-width: 68ch;
      margin: 0 auto !important;
      padding: 2rem 1.5rem 4rem !important;
    }
    h1, h2, h3, h4, h5, h6 { color: #f1f5f9 !important; line-height: 1.3; }
    a { color: #fbbf24; text-decoration: underline; }
    img, svg { max-width: 100%; height: auto; display: block; margin: 1em auto; }
    p { margin-top: 0; margin-bottom: 0.75em; }
    blockquote {
      border-left: 3px solid #334155;
      margin-left: 0;
      padding-left: 1rem;
      color: #94a3b8 !important;
    }
    pre, code { background: #1e293b; border-radius: 4px; padding: 0.15em 0.4em; }
    pre { padding: 1em; overflow-x: auto; }
  `.trim();
}

// ── Asset path resolver (mirrors the one in main) ────────────────────────────

function resolveRelativePath(basePath: string, href: string): string {
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

// ── XHTML → srcdoc processor ─────────────────────────────────────────────────
//
// Security model:
//   - The iframe uses sandbox="allow-same-origin" only.
//     * No allow-scripts → zero JS execution inside the iframe.
//     * allow-same-origin lets the parent (this component) access
//       iframe.contentDocument to update theme CSS without a full reload.
//   - srcdoc is safer than src because the document has no URL of its own;
//     there is no base URL for relative requests to resolve against, so any
//     asset reference we didn't explicitly inline simply fails to load.
//   - All external-origin hrefs on <a> are removed; clicks do nothing.
//   - <script> elements are stripped before injection; even if sandbox were
//     loosened later, there's nothing to run.

function buildSrcdoc(
  xhtml: string,
  assets: Record<string, string>,
  stylesheets: Record<string, string>,
  chapterPath: string,
  settings: ReaderSettings,
): string {
  let html = xhtml;

  // 1. Inline linked stylesheets → <style> blocks.
  //    CSS url() references were already inlined by the main process, so the
  //    text we receive is self-contained.
  html = html.replace(/<link\b([^>]+)>/gi, (match, attrs: string) => {
    if (!/rel=["']stylesheet["']/i.test(attrs)) return match;
    const m = attrs.match(/href=["']([^"']+)["']/i);
    if (!m) return '';
    const href = m[1];
    if (href.startsWith('http') || href.startsWith('data:')) return match;
    const zipPath = resolveRelativePath(chapterPath, href);
    const css = stylesheets[zipPath];
    return css ? `<style>\n${css}\n</style>` : '';
  });

  // 2. Replace binary asset src= attributes (img, audio, video, source…).
  html = html.replace(/\bsrc=(["'])([^"']+)\1/gi, (match, q: string, url: string) => {
    if (url.startsWith('data:') || url.startsWith('http') || url.startsWith('//')) return match;
    const zipPath = resolveRelativePath(chapterPath, url);
    const dataUrl = assets[zipPath];
    return dataUrl ? `src=${q}${dataUrl}${q}` : match;
  });

  // 3. Strip scripts — belt-and-suspenders on top of sandbox.
  html = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  // Also strip inline event handlers.
  html = html.replace(/\s+on\w+=(["'])[^"']*\1/gi, '');

  // 4. Remove external link hrefs so clicks do nothing (navigation is already
  //    blocked by sandbox, but removing href avoids cursor confusion).
  html = html.replace(/\bhref=(["'])(https?:\/\/[^"']*)\1/gi, '');

  // 5. Inject theme style into <head>.  This element gets replaced on theme
  //    changes via contentDocument without a full srcdoc reload.
  const themeTag = `<style id="bookray-theme">\n${buildThemeCSS(settings)}\n</style>`;
  if (/<\/head>/i.test(html)) {
    html = html.replace(/<\/head>/i, `${themeTag}\n</head>`);
  } else {
    html = `<head>${themeTag}</head>\n${html}`;
  }

  return html;
}

// ── Controls toolbar ─────────────────────────────────────────────────────────

interface ControlsProps {
  settings: ReaderSettings;
  onFontSize: (delta: number) => void;
  onLineHeight: (delta: number) => void;
}

function ReaderControls({ settings, onFontSize, onLineHeight }: ControlsProps) {
  const btn =
    'h-7 rounded flex items-center justify-center text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors text-xs px-2';
  return (
    <div className="flex items-center gap-3 px-4 py-2 border-b border-slate-800 bg-slate-900 shrink-0 select-none">
      <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Text</span>
      <div className="flex items-center gap-1">
        <button onClick={() => onFontSize(-1)} className={btn} title="Smaller">
          A−
        </button>
        <span className="text-xs text-slate-500 tabular-nums w-7 text-center">
          {settings.fontSize}
        </span>
        <button onClick={() => onFontSize(1)} className={btn} title="Larger">
          A+
        </button>
      </div>
      <div className="w-px h-4 bg-slate-800" />
      <div className="flex items-center gap-1">
        <span className="text-xs text-slate-500">Spacing</span>
        <button onClick={() => onLineHeight(-0.1)} className={btn} title="Tighter">
          −
        </button>
        <span className="text-xs text-slate-500 tabular-nums w-7 text-center">
          {settings.lineHeight.toFixed(1)}
        </span>
        <button onClick={() => onLineHeight(0.1)} className={btn} title="Looser">
          +
        </button>
      </div>
    </div>
  );
}

// ── ChapterRenderer ───────────────────────────────────────────────────────────

interface Props {
  entry: LibraryBook;
  chapterPath: string;
}

export default function ChapterRenderer({ entry, chapterPath }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [srcdoc, setSrcdoc] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<ReaderSettings>(DEFAULT_SETTINGS);

  // Fetch and process chapter content whenever the chapter changes.
  useEffect(() => {
    let cancelled = false;
    setSrcdoc(null);
    setError(null);
    setLoading(true);

    window.bookray
      .getChapterContent(entry.filePath, chapterPath)
      .then(({ xhtml, assets, stylesheets }) => {
        if (cancelled) return;
        setSrcdoc(buildSrcdoc(xhtml, assets, stylesheets, chapterPath, settings));
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // settings intentionally excluded — theme changes are applied via
    // contentDocument injection (see effect below) without re-fetching.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry.filePath, chapterPath]);

  // Live theme injection: update the #bookray-theme <style> tag in the already-
  // loaded iframe instead of reloading srcdoc. This works because
  // sandbox="allow-same-origin" preserves the parent's origin for the iframe,
  // so the parent can access iframe.contentDocument.
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !srcdoc) return;

    function inject() {
      const doc = iframe!.contentDocument;
      if (!doc) return;
      const el = doc.getElementById('bookray-theme') as HTMLStyleElement | null;
      if (el) el.textContent = buildThemeCSS(settings);
    }

    if (iframe.contentDocument?.readyState === 'complete') {
      inject();
    } else {
      iframe.addEventListener('load', inject, { once: true });
    }
  }, [settings, srcdoc]);

  function adjustFontSize(delta: number) {
    setSettings((s) => ({ ...s, fontSize: Math.max(12, Math.min(28, s.fontSize + delta)) }));
  }

  function adjustLineHeight(delta: number) {
    setSettings((s) => ({
      ...s,
      lineHeight: Math.max(1.2, Math.min(2.5, parseFloat((s.lineHeight + delta).toFixed(1)))),
    }));
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <ReaderControls
        settings={settings}
        onFontSize={adjustFontSize}
        onLineHeight={adjustLineHeight}
      />
      <div className="relative flex-1 min-h-0">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-950 z-10">
            <p className="text-slate-500 text-sm">Loading chapter…</p>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-950 z-10 px-8">
            <p className="text-red-400 text-sm text-center">{error}</p>
          </div>
        )}
        {srcdoc !== null && (
          // Security: sandbox without allow-scripts → no JS runs in the iframe.
          // allow-same-origin is the only token present; it does NOT allow scripts —
          // it only preserves the parent origin so this component can reach into
          // iframe.contentDocument to update the theme style element live.
          <iframe
            ref={iframeRef}
            srcDoc={srcdoc}
            sandbox="allow-same-origin"
            className="w-full h-full border-none bg-slate-950"
            title="Chapter content"
          />
        )}
      </div>
    </div>
  );
}
