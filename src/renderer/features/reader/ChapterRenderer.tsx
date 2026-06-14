import { useEffect, useRef, useState } from 'react';
import type { LibraryBook } from '../library/library.store';
import { useThemeStore } from './theme.store';
import { THEMES, THEME_IDS } from './themes';
import type { Theme } from './themes';

// ── Types ────────────────────────────────────────────────────────────────────

interface ReaderSettings {
  fontSize: number;
  lineHeight: number;
}

const DEFAULT_SETTINGS: ReaderSettings = { fontSize: 17, lineHeight: 1.75 };

// Width threshold for switching to a two-column book spread.
const TWO_PAGE_MIN_WIDTH = 900;

// ── Position persistence ─────────────────────────────────────────────────────
//
// Progress is stored in SQLite via IPC (progressGet / progressSet). We persist
// a 0–1 fraction so the position survives font-size and window-size changes.
// The fraction is fetched in parallel with chapter content and stored in
// pendingFractionRef so initPagination can use it synchronously after rAF.

function savePos(bookId: string, chapterPath: string, page: number, total: number) {
  if (total <= 1) return;
  const fraction = page / total;
  // Fire-and-forget — navigation must not wait on the DB write.
  void window.bookray.progressSet(bookId, chapterPath, fraction);
}

// ── Pagination math ──────────────────────────────────────────────────────────
//
// We use a dedicated #bookray-col div as the CSS multicol container rather than
// <body>. This is critical: Blink only reports scrollWidth > clientWidth when the
// element's overflow is NOT hidden. Body must stay overflow:hidden to act as the
// clip layer; the inner #bookray-col has overflow:visible so its scrollWidth
// correctly reflects the total width of all column boxes.
//
//   totalPages = round(col.scrollWidth / stepWidth)
//
// Reading scrollWidth forces a synchronous reflow, so the CSS var update for
// column-width is always reflected before the measurement.
//
// The +0.5 epsilon guards against sub-pixel rounding (e.g. 899.8 → 1 not 0).

function getColEl(iframe: HTMLIFrameElement): HTMLElement | null {
  return (iframe.contentDocument?.getElementById('bookray-col') as HTMLElement) ?? null;
}

function measureTotalPages(iframe: HTMLIFrameElement, stepWidth: number): number {
  const col = getColEl(iframe);
  if (!col || stepWidth === 0) return 1;
  return Math.max(1, Math.round((col.scrollWidth + 0.5) / stepWidth));
}

function applyPage(iframe: HTMLIFrameElement, page: number, stepWidth: number) {
  const col = getColEl(iframe);
  if (!col) return;
  col.style.transform = `translateX(${-page * stepWidth}px)`;
}

// ── Layout helper ────────────────────────────────────────────────────────────
//
// Single-page:  column-width = containerWidth, stepWidth = containerWidth
// Two-page:     column-width = containerWidth/2, stepWidth = containerWidth
//               Two columns fill the viewport naturally; one "page turn" = 2 cols

function getLayout(containerWidth: number) {
  const twoPage = containerWidth >= TWO_PAGE_MIN_WIDTH;
  const columnWidth = twoPage ? Math.floor(containerWidth / 2) : containerWidth;
  const stepWidth = containerWidth; // always advance by the full viewport width
  return { columnWidth, stepWidth, twoPage };
}

// ── CSS ──────────────────────────────────────────────────────────────────────
//
// The pager style uses a CSS custom property --br-pw (BookRay page width) for
// column-width. The parent sets this var after the iframe loads, which triggers
// a synchronous reflow so that reading body.scrollWidth immediately after gives
// the correct columned layout dimensions.
//
// The #bookray-pg wrapper div receives the per-page padding. Padding on the
// multicol container itself would not apply per-column; the wrapper div is
// inside each column so its padding is scoped per page.

function buildPagerCSS(): string {
  return `
    /* overscroll-behavior:none stops Chromium from hijacking horizontal
       trackpad swipes as history back/forward navigation, so they arrive as
       cancelable wheel events our swipe handler can read. */
    html { height: 100%; overflow: hidden; overscroll-behavior: none; }
    body {
      height: 100% !important;
      overflow: hidden !important;
      overscroll-behavior: none !important;
      max-width: none !important;
      margin: 0 !important;
      padding: 0 !important;
    }
    /* #bookray-col is the multicol container. overflow:visible is required so
       that scrollWidth reports the FULL column extent (Blink returns clientWidth
       when overflow is hidden, making totalPages always 1). Body clips it. */
    #bookray-col {
      height: 100%;
      overflow: visible;
      column-width: var(--br-pw, 800px);
      column-gap: 0;
      column-fill: auto;
      will-change: transform;
      transition: transform 0.28s cubic-bezier(0.4, 0, 0.2, 1);
    }
    #bookray-pg { padding: 2.5rem 3.5rem; }
    img, figure, table, pre { break-inside: avoid; page-break-inside: avoid; }
    p, li { orphans: 2; widows: 2; }
  `.trim();
}

function buildThemeCSS({ fontSize, lineHeight }: ReaderSettings, theme: Theme): string {
  return `
    *, *::before, *::after { box-sizing: border-box; }
    html { background: ${theme.bg} !important; }
    body {
      background: ${theme.bg} !important;
      color: ${theme.text} !important;
      font-size: ${fontSize}px !important;
      line-height: ${lineHeight} !important;
      font-family: 'Iowan Old Style', Georgia, Palatino, serif;
    }
    body * { color: ${theme.text} !important; }
    h1, h2, h3, h4, h5, h6 { color: ${theme.heading} !important; line-height: 1.3; }
    a, a:visited { color: ${theme.link} !important; }
    *:hover { color: inherit !important; }
    h1:hover, h2:hover, h3:hover, h4:hover, h5:hover, h6:hover { color: ${theme.heading} !important; }
    img, svg { max-width: 100%; height: auto; display: block; margin: 1em auto; }
    p { margin-top: 0; margin-bottom: 0.75em; }
    blockquote {
      border-left: 3px solid ${theme.blockquoteBorder};
      margin-left: 0;
      padding-left: 1rem;
      color: ${theme.blockquoteText} !important;
    }
    pre, code { background: ${theme.codeBg}; border-radius: 4px; padding: 0.15em 0.4em; }
    pre { padding: 1em; overflow-x: auto; }
  `.trim();
}

// ── Asset path resolver ──────────────────────────────────────────────────────

function resolveRelativePath(basePath: string, href: string): string {
  let decoded = href;
  try { decoded = decodeURIComponent(href); } catch { /* keep original */ }
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

// ── XHTML → srcdoc ──────────────────────────────────────────────────────────
//
// Security model unchanged from before — sandbox="allow-same-origin", no scripts.
// New: we wrap the <body> content in <div id="bookray-pg"> for per-page padding,
// and inject a second <style id="bookray-pager"> for the column layout.

function buildSrcdoc(
  xhtml: string,
  assets: Record<string, string>,
  stylesheets: Record<string, string>,
  chapterPath: string,
  settings: ReaderSettings,
  theme: Theme,
): string {
  let html = xhtml;

  // 1. Inline linked stylesheets
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

  // 2. Replace binary asset src= attributes
  html = html.replace(/\bsrc=(["'])([^"']+)\1/gi, (match, q: string, url: string) => {
    if (url.startsWith('data:') || url.startsWith('http') || url.startsWith('//')) return match;
    const zipPath = resolveRelativePath(chapterPath, url);
    const dataUrl = assets[zipPath];
    return dataUrl ? `src=${q}${dataUrl}${q}` : match;
  });

  // 3. Strip scripts and event handlers
  html = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  html = html.replace(/\s+on\w+=(["'])[^"']*\1/gi, '');

  // 4. Remove external link hrefs
  html = html.replace(/\bhref=(["'])(https?:\/\/[^"']*)\1/gi, '');

  // 5. Wrap body content.
  //    #bookray-col is the multicol container (overflow:visible so scrollWidth
  //    reports total column extent). #bookray-pg is the inner padding wrapper
  //    (padding on the multicol container itself would shrink column boxes and
  //    break the stepWidth math, so it lives one level deeper).
  html = html.replace(
    /(<body(?:\s[^>]*)?>)([\s\S]*)(<\/body>)/i,
    (_, open, inner, close) =>
      `${open}<div id="bookray-col"><div id="bookray-pg">${inner}</div></div>${close}`,
  );

  // 6. Inject styles — pager first so theme can override if needed
  const styles = [
    `<style id="bookray-pager">\n${buildPagerCSS()}\n</style>`,
    `<style id="bookray-theme">\n${buildThemeCSS(settings, theme)}\n</style>`,
  ].join('\n');

  if (/<\/head>/i.test(html)) {
    html = html.replace(/<\/head>/i, `${styles}\n</head>`);
  } else {
    html = `<head>${styles}</head>\n${html}`;
  }

  return html;
}

// ── ReaderControls ───────────────────────────────────────────────────────────

interface ControlsProps {
  settings: ReaderSettings;
  theme: Theme;
  onFontSize: (delta: number) => void;
  onLineHeight: (delta: number) => void;
  onTheme: (id: string) => void;
}

function ReaderControls({ settings, theme, onFontSize, onLineHeight, onTheme }: ControlsProps) {
  const { setTheme } = useThemeStore();
  return (
    <div
      className="flex items-center gap-3 px-4 py-2 border-b shrink-0 select-none"
      style={{ background: theme.chromeBg, borderColor: theme.chromeBorder }}
    >
      <span className="text-xs" style={{ color: theme.chromeTextMuted }}>Text</span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onFontSize(-1)}
          className="h-7 rounded px-2 text-xs transition-colors"
          style={{ color: theme.chromeText }}
          onMouseEnter={(e) => (e.currentTarget.style.background = theme.chromeBtnHover)}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          title="Smaller"
        >A−</button>
        <span className="text-xs tabular-nums w-7 text-center" style={{ color: theme.chromeTextMuted }}>{settings.fontSize}</span>
        <button
          onClick={() => onFontSize(1)}
          className="h-7 rounded px-2 text-xs transition-colors"
          style={{ color: theme.chromeText }}
          onMouseEnter={(e) => (e.currentTarget.style.background = theme.chromeBtnHover)}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          title="Larger"
        >A+</button>
      </div>
      <div className="w-px h-4" style={{ background: theme.chromeBorder }} />
      <div className="flex items-center gap-1">
        <span className="text-xs" style={{ color: theme.chromeTextMuted }}>Spacing</span>
        <button
          onClick={() => onLineHeight(-0.1)}
          className="h-7 rounded px-2 text-xs transition-colors"
          style={{ color: theme.chromeText }}
          onMouseEnter={(e) => (e.currentTarget.style.background = theme.chromeBtnHover)}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          title="Tighter"
        >−</button>
        <span className="text-xs tabular-nums w-7 text-center" style={{ color: theme.chromeTextMuted }}>
          {settings.lineHeight.toFixed(1)}
        </span>
        <button
          onClick={() => onLineHeight(0.1)}
          className="h-7 rounded px-2 text-xs transition-colors"
          style={{ color: theme.chromeText }}
          onMouseEnter={(e) => (e.currentTarget.style.background = theme.chromeBtnHover)}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          title="Looser"
        >+</button>
      </div>
      <div className="w-px h-4" style={{ background: theme.chromeBorder }} />
      {/* Theme swatches */}
      <div className="flex items-center gap-1.5 ml-auto">
        {THEME_IDS.map((id) => (
          <button
            key={id}
            onClick={() => { setTheme(id); onTheme(id); }}
            title={THEMES[id].name}
            className="w-4 h-4 rounded-full border-2 transition-transform hover:scale-110 cursor-pointer"
            style={{
              background: THEMES[id].bg,
              borderColor: theme.id === id ? theme.chromeText : theme.chromeBorder,
            }}
          />
        ))}
      </div>
    </div>
  );
}

// ── PaginationBar ─────────────────────────────────────────────────────────────

interface PaginationBarProps {
  page: number;
  total: number;
  twoPage: boolean;
  theme: Theme;
  bookProgress: number;
  onPrev: () => void;
  onNext: () => void;
}

function PaginationBar({ page, total, twoPage, theme, bookProgress, onPrev, onNext }: PaginationBarProps) {
  return (
    <div
      className="flex items-center justify-between px-6 py-2 border-t shrink-0 select-none"
      style={{ background: theme.chromeBg, borderColor: theme.chromeBorder }}
    >
      <button
        onClick={onPrev}
        disabled={page === 0}
        className="h-8 w-8 rounded flex items-center justify-center transition-colors disabled:opacity-25 disabled:cursor-not-allowed cursor-pointer"
        style={{ color: theme.chromeText }}
        onMouseEnter={(e) => { if (page > 0) (e.currentTarget as HTMLButtonElement).style.background = theme.chromeBtnHover; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
        title="Previous page (←)"
      >
        <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4">
          <path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <span className="text-xs tabular-nums" style={{ color: theme.chromeTextMuted }}>
        {twoPage ? 'Spread' : 'Page'}{' '}
        <span style={{ color: theme.chromeText }}>{page + 1}</span>
        <span className="mx-1" style={{ color: theme.chromeBorder }}>/</span>
        {total}
        <span className="mx-2" style={{ color: theme.chromeBorder }}>·</span>
        <span style={{ color: theme.chromeText }}>{bookProgress}%</span>
      </span>
      <button
        onClick={onNext}
        disabled={page >= total - 1}
        className="h-8 w-8 rounded flex items-center justify-center transition-colors disabled:opacity-25 disabled:cursor-not-allowed cursor-pointer"
        style={{ color: theme.chromeText }}
        onMouseEnter={(e) => { if (page < total - 1) (e.currentTarget as HTMLButtonElement).style.background = theme.chromeBtnHover; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
        title="Next page (→)"
      >
        <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4">
          <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  );
}

// ── ChapterRenderer ───────────────────────────────────────────────────────────

interface Props {
  entry: LibraryBook;
  chapterPath: string;
}

export default function ChapterRenderer({ entry, chapterPath }: Props) {
  // chapterPath may include a #fragment for sidebar selection uniqueness — strip it for content fetching
  const basePath = chapterPath.includes('#') ? chapterPath.split('#')[0] : chapterPath;

  const containerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const themeId  = useThemeStore((s) => s.themeId);
  const theme    = THEMES[themeId];

  const [srcdoc, setSrcdoc] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<ReaderSettings>(DEFAULT_SETTINGS);

  // Pagination display state
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [twoPage, setTwoPage] = useState(false);

  // Refs to avoid stale closures in stable callbacks (keyboard, resize observer).
  // These are always kept in sync with the state values above.
  const pageRef = useRef(0);
  const totalRef = useRef(1);
  const stepWidthRef = useRef(0);

  // Progress fetched from DB in parallel with chapter content; consumed once by initPagination.
  const pendingFractionRef = useRef<number | null>(null);

  // ── Layout ─────────────────────────────────────────────────────────────────

  function currentLayout() {
    const w = containerRef.current?.clientWidth ?? 800;
    return getLayout(w);
  }

  // ── Core pagination operations ─────────────────────────────────────────────

  function syncState(p: number, total: number, step: number, tp: boolean) {
    pageRef.current = p;
    totalRef.current = total;
    stepWidthRef.current = step;
    setPage(p);
    setTotalPages(total);
    setTwoPage(tp);
  }

  // Called once after iframe loads. Sets the CSS var, measures pages, restores position.
  function initPagination() {
    const iframe = iframeRef.current;
    const doc = iframe?.contentDocument;
    if (!doc?.documentElement) return;

    const { columnWidth, stepWidth, twoPage: tp } = currentLayout();

    // Setting --br-pw triggers a synchronous reflow. body.scrollWidth read
    // immediately after reflects the new column layout.
    doc.documentElement.style.setProperty('--br-pw', `${columnWidth}px`);

    const total = measureTotalPages(iframe!, stepWidth);

    const frac = pendingFractionRef.current;
    pendingFractionRef.current = null;
    const restored = frac !== null
      ? Math.min(total - 1, Math.max(0, Math.round(frac * total)))
      : 0;

    syncState(restored, total, stepWidth, tp);
    applyPage(iframe!, restored, stepWidth);
  }

  // Called on resize or font change. Preserves fractional position.
  function recheckPages() {
    const iframe = iframeRef.current;
    const doc = iframe?.contentDocument;
    if (!doc?.documentElement) return;

    const { columnWidth, stepWidth, twoPage: tp } = currentLayout();
    doc.documentElement.style.setProperty('--br-pw', `${columnWidth}px`);

    const total = measureTotalPages(iframe!, stepWidth);
    const frac = totalRef.current > 1 ? pageRef.current / totalRef.current : 0;
    const newPage = Math.min(total - 1, Math.max(0, Math.round(frac * total)));

    syncState(newPage, total, stepWidth, tp);
    applyPage(iframe!, newPage, stepWidth);
  }

  function goToPage(target: number) {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const clamped = Math.max(0, Math.min(totalRef.current - 1, target));
    applyPage(iframe, clamped, stepWidthRef.current);
    pageRef.current = clamped;
    setPage(clamped);
    savePos(entry.id, basePath, clamped, totalRef.current);
  }

  // ── Fetch chapter ──────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    setSrcdoc(null);
    setError(null);
    setLoading(true);
    syncState(0, 1, 0, false);

    Promise.all([
      window.bookray.getChapterContent(entry.filePath, basePath),
      window.bookray.progressGet(entry.id),
    ])
      .then(([{ xhtml, assets, stylesheets }, progress]) => {
        if (cancelled) return;
        // Store fraction for initPagination to consume after the iframe loads.
        pendingFractionRef.current =
          progress?.chapterPath === basePath ? progress.pageFraction : null;
        setSrcdoc(buildSrcdoc(xhtml, assets, stylesheets, basePath, settings, theme));
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
    // settings excluded — theme changes go through contentDocument injection below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry.filePath, chapterPath]);

  // ── Init pagination after iframe loads ────────────────────────────────────

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || srcdoc === null) return;

    function onLoad() {
      // rAF ensures the browser has painted and columns are fully laid out
      requestAnimationFrame(() => initPagination());
    }

    if (iframe.contentDocument?.readyState === 'complete') {
      requestAnimationFrame(() => initPagination());
    } else {
      iframe.addEventListener('load', onLoad, { once: true });
      return () => iframe.removeEventListener('load', onLoad);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [srcdoc]);

  // ── Live theme injection ───────────────────────────────────────────────────

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || srcdoc === null) return;

    function inject() {
      const doc = iframe!.contentDocument;
      if (!doc?.documentElement) return;
      const el = doc.getElementById('bookray-theme') as HTMLStyleElement | null;
      if (el) {
        el.textContent = buildThemeCSS(settings, theme);
        requestAnimationFrame(() => recheckPages());
      }
    }

    if (iframe.contentDocument?.readyState === 'complete') {
      inject();
    } else {
      iframe.addEventListener('load', inject, { once: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings, theme, srcdoc]);

  // ── ResizeObserver ─────────────────────────────────────────────────────────

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let timer: ReturnType<typeof setTimeout>;
    const ro = new ResizeObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(() => recheckPages(), 120);
    });
    ro.observe(container);
    return () => { clearTimeout(timer); ro.disconnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Keyboard navigation ────────────────────────────────────────────────────

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.target as Element)?.closest('input, textarea')) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        goToPage(pageRef.current + 1);
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        goToPage(pageRef.current - 1);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Horizontal swipe navigation ─────────────────────────────────────────────
  //
  // Trackpad two-finger sideways swipe and a sideways mouse swipe (Magic Mouse /
  // tilt-wheel) both surface as `wheel` events carrying horizontal deltaX. We
  // listen on the iframe's own document — wheel events inside the sandboxed
  // iframe do not bubble to the parent — and preventDefault to suppress Electron's
  // built-in history back/forward swipe.
  //
  // Model: accumulate deltaX until it crosses a threshold, turn one page, then
  // lock until the gesture goes idle. The lock stops the inertial momentum tail
  // (which keeps firing wheel events after the fingers lift) from flipping
  // through several pages at once — one deliberate swipe turns one page.

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || srcdoc === null) return;

    const THRESHOLD = 40; // px of accumulated horizontal travel to turn a page
    const IDLE_MS = 120;  // no wheel events for this long = gesture ended
    let accum = 0;
    let locked = false;
    let idle: ReturnType<typeof setTimeout>;

    function onWheel(e: WheelEvent) {
      // Horizontal intent only — let vertical/diagonal scroll pass through.
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
      e.preventDefault();

      clearTimeout(idle);
      idle = setTimeout(() => { locked = false; accum = 0; }, IDLE_MS);
      if (locked) return;

      accum += e.deltaX;
      if (accum >= THRESHOLD) {
        goToPage(pageRef.current + 1);
        locked = true;
        accum = 0;
      } else if (accum <= -THRESHOLD) {
        goToPage(pageRef.current - 1);
        locked = true;
        accum = 0;
      }
    }

    function attachTo(doc: Document | null | undefined) {
      if (!doc) return;
      doc.removeEventListener('wheel', onWheel);
      doc.addEventListener('wheel', onWheel, { passive: false });
    }

    // Attach to whatever is loaded right now, and re-attach on every subsequent
    // load. Setting srcDoc swaps in a brand-new document, so a one-shot attach
    // bound to the old (or about:blank) document would be lost when the real
    // chapter finishes loading — hence re-attaching on each `load`.
    attachTo(iframe.contentDocument);
    function onLoad() { attachTo(iframe!.contentDocument); }
    iframe.addEventListener('load', onLoad);

    return () => {
      clearTimeout(idle);
      iframe.removeEventListener('load', onLoad);
      iframe.contentDocument?.removeEventListener('wheel', onWheel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [srcdoc]);

  // ── Settings ───────────────────────────────────────────────────────────────

  function adjustFontSize(delta: number) {
    setSettings((s) => ({ ...s, fontSize: Math.max(12, Math.min(28, s.fontSize + delta)) }));
  }

  function adjustLineHeight(delta: number) {
    setSettings((s) => ({
      ...s,
      lineHeight: Math.max(1.2, Math.min(2.5, parseFloat((s.lineHeight + delta).toFixed(1)))),
    }));
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full min-h-0">
      <ReaderControls settings={settings} theme={theme} onFontSize={adjustFontSize} onLineHeight={adjustLineHeight} onTheme={() => {}} />

      <div ref={containerRef} className="relative flex-1 min-h-0 overflow-hidden">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center z-10" style={{ background: theme.bg }}>
            <p className="text-sm" style={{ color: theme.chromeTextMuted }}>Loading chapter…</p>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center z-10 px-8" style={{ background: theme.bg }}>
            <p className="text-red-400 text-sm text-center">{error}</p>
          </div>
        )}
        {srcdoc !== null && (
          <iframe
            ref={iframeRef}
            srcDoc={srcdoc}
            sandbox="allow-same-origin"
            className="absolute inset-0 w-full h-full border-none bg-slate-950"
            title="Chapter content"
          />
        )}
      </div>

      {srcdoc !== null && (() => {
        const linearSpine = entry.book.spine.filter((c) => c.linear);
        const chapterIdx = linearSpine.findIndex((c) => c.path === basePath);
        const pageFrac = totalPages > 1 ? page / totalPages : 0;
        const bookProgress = linearSpine.length > 0 && chapterIdx >= 0
          ? Math.round(((chapterIdx + pageFrac) / linearSpine.length) * 100)
          : 0;
        return (
          <PaginationBar
            page={page}
            total={totalPages}
            twoPage={twoPage}
            theme={theme}
            bookProgress={bookProgress}
            onPrev={() => goToPage(pageRef.current - 1)}
            onNext={() => goToPage(pageRef.current + 1)}
          />
        );
      })()}
    </div>
  );
}
