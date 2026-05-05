import { DOMParser, type Document, type Element } from '@xmldom/xmldom';
import { parseZip } from './zip.ts';
import type {
  EpubBook,
  EpubChapter,
  EpubManifestItem,
  EpubMetadata,
  TocItem,
} from '../../shared/types/epub.types.ts';

/**
 * EPUB parser. Reads container.xml → OPF (metadata, manifest, spine) → TOC.
 *
 * Supports both EPUB 2 (NCX-based TOC) and EPUB 3 (XHTML nav document).
 */

const NS = {
  CONTAINER: 'urn:oasis:names:tc:opendocument:xmlns:container',
  OPF: 'http://www.idpf.org/2007/opf',
  DC: 'http://purl.org/dc/elements/1.1/',
  NCX: 'http://www.daisy.org/z3986/2005/ncx/',
  XHTML: 'http://www.w3.org/1999/xhtml',
  EPUB: 'http://www.idpf.org/2007/ops',
} as const;

const MIMETYPE_VALUE = 'application/epub+zip';

export function parseEpub(input: Buffer | ArrayBuffer): EpubBook {
  return parseEpubFromZip(parseZip(input));
}

export function parseEpubFromZip(zip: ReturnType<typeof parseZip>): EpubBook {
  // 1. Validate the magic mimetype entry.
  const mimetype = zip.get('mimetype');
  if (!mimetype || mimetype.data.toString('utf8').trim() !== MIMETYPE_VALUE) {
    throw new Error('Not an EPUB: missing or invalid mimetype');
  }

  // 2. container.xml → OPF location. This is the one fixed-path file in the
  // archive; everything else's location is discovered by following pointers.
  const container = zip.get('META-INF/container.xml');
  if (!container) {
    throw new Error('Not an EPUB: missing META-INF/container.xml');
  }
  const opfPath = readOpfPath(container.data.toString('utf8'));

  // 3. OPF (package document): metadata, manifest, spine.
  const opfEntry = zip.get(opfPath);
  if (!opfEntry) {
    throw new Error(`OPF file not found in archive at "${opfPath}"`);
  }
  const opf = parseOpf(opfEntry.data.toString('utf8'), opfPath);

  // 4. TOC. Prefer EPUB 3 nav (more semantic, modern); fall back to NCX.
  let toc: TocItem[] = [];
  if (opf.navPath) {
    const navEntry = zip.get(opf.navPath);
    if (navEntry) {
      toc = parseNav(navEntry.data.toString('utf8'), opf.navPath);
    }
  }
  if (toc.length === 0 && opf.ncxPath) {
    const ncxEntry = zip.get(opf.ncxPath);
    if (ncxEntry) {
      toc = parseNcx(ncxEntry.data.toString('utf8'), opf.ncxPath);
    }
  }

  return {
    version: opf.version,
    opfPath,
    metadata: opf.metadata,
    manifest: opf.manifest,
    spine: opf.spine,
    toc,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// container.xml
// ────────────────────────────────────────────────────────────────────────────

/**
 * container.xml shape:
 *   <container ... xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
 *     <rootfiles>
 *       <rootfile full-path="OEBPS/content.opf"
 *                 media-type="application/oebps-package+xml"/>
 *     </rootfiles>
 *   </container>
 *
 * Multiple rootfiles can be declared; we pick the first OPF rootfile.
 */
function readOpfPath(xml: string): string {
  const doc = parseXml(xml);
  const rootfiles = getElementsByLocalName(doc, 'rootfile');
  for (const rootfile of rootfiles) {
    const mediaType = rootfile.getAttribute('media-type');
    if (mediaType === 'application/oebps-package+xml') {
      const path = rootfile.getAttribute('full-path');
      if (path) return path;
    }
  }
  throw new Error('container.xml does not declare an OPF rootfile');
}

// ────────────────────────────────────────────────────────────────────────────
// OPF
// ────────────────────────────────────────────────────────────────────────────

interface ParsedOpf {
  version: '2' | '3';
  metadata: EpubMetadata;
  manifest: Map<string, EpubManifestItem>;
  spine: EpubChapter[];
  /** ZIP path of the NCX file, if the spine declares one. */
  ncxPath?: string;
  /** ZIP path of the EPUB 3 nav document, if the manifest declares one. */
  navPath?: string;
}

function parseOpf(xml: string, opfPath: string): ParsedOpf {
  const doc = parseXml(xml);

  const pkg = getElementsByLocalName(doc, 'package')[0];
  if (!pkg) throw new Error('OPF missing <package> root element');

  const versionAttr = pkg.getAttribute('version') ?? '2.0';
  const version: '2' | '3' = versionAttr.startsWith('3') ? '3' : '2';

  // ── Manifest ────────────────────────────────────────────────────────────
  const manifest = new Map<string, EpubManifestItem>();
  const manifestEl = getElementsByLocalName(pkg, 'manifest')[0];
  if (!manifestEl) throw new Error('OPF missing <manifest>');

  let navPath: string | undefined;

  for (const item of childrenByLocalName(manifestEl, 'item')) {
    const id = item.getAttribute('id');
    const href = item.getAttribute('href');
    const mediaType = item.getAttribute('media-type');
    if (!id || !href || !mediaType) continue;

    // `properties` is a space-separated token list (EPUB 3): "cover-image",
    // "nav", "scripted", "mathml", etc.
    const propsAttr = item.getAttribute('properties') ?? '';
    const properties = propsAttr.split(/\s+/).filter(Boolean);

    const path = resolvePath(opfPath, href);
    manifest.set(id, { id, path, mediaType, properties });

    if (properties.includes('nav')) navPath = path;
  }

  // ── Spine ───────────────────────────────────────────────────────────────
  const spineEl = getElementsByLocalName(pkg, 'spine')[0];
  if (!spineEl) throw new Error('OPF missing <spine>');

  const spine: EpubChapter[] = [];
  for (const itemref of childrenByLocalName(spineEl, 'itemref')) {
    const idref = itemref.getAttribute('idref');
    if (!idref) continue;
    const item = manifest.get(idref);
    if (!item) continue; // dangling ref — skip rather than throw
    spine.push({
      id: item.id,
      path: item.path,
      mediaType: item.mediaType,
      // `linear="no"` marks auxiliary content (footnotes, etc.) — still in
      // the spine but not part of the main reading flow.
      linear: itemref.getAttribute('linear') !== 'no',
    });
  }

  // The spine's `toc` attribute (EPUB 2) names the manifest id of the NCX.
  let ncxPath: string | undefined;
  const tocId = spineEl.getAttribute('toc');
  if (tocId) {
    const ncxItem = manifest.get(tocId);
    if (ncxItem) ncxPath = ncxItem.path;
  }
  // Fallback: any manifest item with NCX media-type.
  if (!ncxPath) {
    for (const item of manifest.values()) {
      if (item.mediaType === 'application/x-dtbncx+xml') {
        ncxPath = item.path;
        break;
      }
    }
  }

  // ── Metadata ────────────────────────────────────────────────────────────
  const metadataEl = getElementsByLocalName(pkg, 'metadata')[0];
  const metadata = parseMetadata(metadataEl, manifest, version);

  return { version, metadata, manifest, spine, ncxPath, navPath };
}

function parseMetadata(
  metadataEl: Element | undefined,
  manifest: Map<string, EpubManifestItem>,
  version: '2' | '3',
): EpubMetadata {
  const out: EpubMetadata = {
    title: '',
    authors: [],
    language: '',
  };

  if (!metadataEl) return out;

  const dcText = (localName: string): string | undefined => {
    const el = childrenByLocalName(metadataEl, localName).find(
      (e) => e.namespaceURI === NS.DC || !e.namespaceURI,
    );
    const text = el?.textContent?.trim();
    return text ? text : undefined;
  };

  out.title = dcText('title') ?? '';
  out.language = dcText('language') ?? '';
  out.publisher = dcText('publisher');
  out.identifier = dcText('identifier');
  out.description = dcText('description');
  out.publishedDate = dcText('date');

  // Multiple <dc:creator> elements are allowed (co-authors).
  for (const el of childrenByLocalName(metadataEl, 'creator')) {
    if (el.namespaceURI && el.namespaceURI !== NS.DC) continue;
    const name = el.textContent?.trim();
    if (name) out.authors.push(name);
  }

  // ── Cover discovery ─────────────────────────────────────────────────────
  // EPUB 3: a manifest item with properties="cover-image".
  if (version === '3') {
    for (const item of manifest.values()) {
      if (item.properties.includes('cover-image')) {
        out.coverPath = item.path;
        break;
      }
    }
  }
  // EPUB 2 (or fallback): <meta name="cover" content="cover-id"/> in metadata,
  // pointing to a manifest id.
  if (!out.coverPath) {
    for (const meta of childrenByLocalName(metadataEl, 'meta')) {
      if (meta.getAttribute('name') === 'cover') {
        const id = meta.getAttribute('content');
        if (id) {
          const item = manifest.get(id);
          if (item) {
            out.coverPath = item.path;
            break;
          }
        }
      }
    }
  }

  return out;
}

// ────────────────────────────────────────────────────────────────────────────
// EPUB 3 nav document (XHTML)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Looks for `<nav epub:type="toc">` and walks its first `<ol>`.
 * Each `<li>` typically contains an `<a href>` with the entry label, plus
 * an optional nested `<ol>` for sub-entries.
 */
function parseNav(xml: string, navPath: string): TocItem[] {
  const doc = parseXml(xml);
  const navs = getElementsByLocalName(doc, 'nav');
  let tocNav: Element | undefined;
  for (const nav of navs) {
    // `epub:type` is namespaced; xmldom exposes it via getAttributeNS too,
    // but in practice EPUB files declare the prefix and getAttribute("epub:type")
    // works. We try both to be safe.
    const epubType =
      nav.getAttributeNS(NS.EPUB, 'type') ?? nav.getAttribute('epub:type');
    if (epubType === 'toc') {
      tocNav = nav;
      break;
    }
  }
  if (!tocNav) return [];

  const ol = childrenByLocalName(tocNav, 'ol')[0];
  if (!ol) return [];
  return walkOl(ol, navPath);
}

function walkOl(ol: Element, basePath: string): TocItem[] {
  const items: TocItem[] = [];
  for (const li of childrenByLocalName(ol, 'li')) {
    // The <a> may be a direct child or wrapped (rare); we look one level deep.
    let a = childrenByLocalName(li, 'a')[0];
    if (!a) a = childrenByLocalName(li, 'span')[0]; // unlinked headings
    const href = a?.getAttribute('href') ?? '';
    const label = (a?.textContent ?? '').trim();
    const childOl = childrenByLocalName(li, 'ol')[0];

    const { path, fragment } = splitHref(href, basePath);
    items.push({
      label,
      path,
      ...(fragment ? { fragment } : {}),
      children: childOl ? walkOl(childOl, basePath) : [],
    });
  }
  return items;
}

// ────────────────────────────────────────────────────────────────────────────
// EPUB 2 NCX
// ────────────────────────────────────────────────────────────────────────────

/**
 * NCX shape:
 *   <ncx ... xmlns="http://www.daisy.org/z3986/2005/ncx/">
 *     <navMap>
 *       <navPoint id="..." playOrder="1">
 *         <navLabel><text>Chapter 1</text></navLabel>
 *         <content src="chapter1.xhtml"/>
 *         <navPoint>...</navPoint>  ← optional nested entries
 *       </navPoint>
 *       ...
 *     </navMap>
 *   </ncx>
 */
function parseNcx(xml: string, ncxPath: string): TocItem[] {
  const doc = parseXml(xml);
  const navMap = getElementsByLocalName(doc, 'navMap')[0];
  if (!navMap) return [];
  return walkNavPoints(navMap, ncxPath);
}

function walkNavPoints(parent: Element, basePath: string): TocItem[] {
  const items: TocItem[] = [];
  for (const navPoint of childrenByLocalName(parent, 'navPoint')) {
    const labelEl = childrenByLocalName(navPoint, 'navLabel')[0];
    const textEl = labelEl
      ? childrenByLocalName(labelEl, 'text')[0]
      : undefined;
    const contentEl = childrenByLocalName(navPoint, 'content')[0];
    const label = textEl?.textContent?.trim() ?? '';
    const src = contentEl?.getAttribute('src') ?? '';
    const { path, fragment } = splitHref(src, basePath);
    items.push({
      label,
      path,
      ...(fragment ? { fragment } : {}),
      children: walkNavPoints(navPoint, basePath),
    });
  }
  return items;
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function parseXml(xml: string): Document {
  return new DOMParser().parseFromString(xml, 'text/xml');
}

/**
 * Returns elements anywhere in the tree whose localName matches.
 * Ignores namespace prefixes — useful because EPUB XML uses several.
 */
function getElementsByLocalName(
  root: Document | Element,
  localName: string,
): Element[] {
  const list = root.getElementsByTagNameNS('*', localName);
  const out: Element[] = [];
  for (let i = 0; i < list.length; i++) {
    const el = list.item(i);
    if (el) out.push(el);
  }
  return out;
}

/** Direct children only, filtered by localName. */
function childrenByLocalName(parent: Element, localName: string): Element[] {
  const out: Element[] = [];
  const children = parent.childNodes;
  for (let i = 0; i < children.length; i++) {
    const child = children.item(i);
    if (
      child &&
      child.nodeType === 1 /* ELEMENT_NODE */ &&
      (child as Element).localName === localName
    ) {
      out.push(child as Element);
    }
  }
  return out;
}

/**
 * Resolve a relative href against the directory of `basePath`. Both inputs
 * are ZIP paths using forward slashes. Handles `./`, `../`, and percent-
 * encoded characters (which appear in EPUB hrefs for spaces, etc.).
 */
function resolvePath(basePath: string, relative: string): string {
  const baseDir = basePath.includes('/')
    ? basePath.slice(0, basePath.lastIndexOf('/'))
    : '';
  const decoded = safeDecodeURI(relative);
  const combined = baseDir ? `${baseDir}/${decoded}` : decoded;
  const stack: string[] = [];
  for (const part of combined.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') stack.pop();
    else stack.push(part);
  }
  return stack.join('/');
}

function splitHref(
  href: string,
  basePath: string,
): { path: string; fragment?: string } {
  if (!href) return { path: '' };
  const hashIdx = href.indexOf('#');
  if (hashIdx < 0) return { path: resolvePath(basePath, href) };
  const pathPart = href.slice(0, hashIdx);
  const fragment = href.slice(hashIdx + 1);
  // An href like "#anchor" with no path means "this same document". The
  // resolver returns basePath in that case.
  const path = pathPart === '' ? basePath : resolvePath(basePath, pathPart);
  return { path, fragment: fragment || undefined };
}

function safeDecodeURI(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}
