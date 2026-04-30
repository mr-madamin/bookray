export interface EpubMetadata {
  title: string;
  authors: string[];
  language: string;
  publisher?: string;
  identifier?: string;
  description?: string;
  publishedDate?: string;
  /** Resolved ZIP path of the cover image, if any. */
  coverPath?: string;
}

export interface EpubManifestItem {
  id: string;
  /** Resolved ZIP path. */
  path: string;
  mediaType: string;
  /** Tokens from the OPF `properties` attribute (EPUB 3), e.g. "cover-image", "nav". */
  properties: string[];
}

/** A spine entry — one resource in linear reading order. */
export interface EpubChapter {
  id: string;
  path: string;
  mediaType: string;
  /** False when the spine entry is marked `linear="no"` (auxiliary content). */
  linear: boolean;
}

/** A single TOC entry. */
export interface TocItem {
  label: string;
  /** Resolved ZIP path of the linked resource. */
  path: string;
  /** Optional anchor inside the resource (without the leading '#'). */
  fragment?: string;
  children: TocItem[];
}

export interface EpubBook {
  version: '2' | '3';
  /** ZIP path of the OPF file. */
  opfPath: string;
  metadata: EpubMetadata;
  /** All resources declared in the OPF manifest, keyed by manifest id. */
  manifest: Map<string, EpubManifestItem>;
  /** Linear reading order. */
  spine: EpubChapter[];
  /** Hierarchical table of contents. May be empty if the book has none. */
  toc: TocItem[];
}
