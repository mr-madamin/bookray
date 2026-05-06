# BookRay

Electron desktop app for reading EPUB books.

## Tech stack

| Layer        | Technology                                |
| ------------ | ----------------------------------------- |
| Shell        | Electron 41                               |
| Renderer     | React 19 + Vite + Tailwind v4             |
| State        | Zustand 5                                 |
| Main/Preload | TypeScript → CommonJS via tsc             |
| EPUB parsing | Custom ZIP + OPF parser (no dependencies) |

## Development

```
npm run dev
```

Starts four processes in parallel: main compiler (watch), preload compiler (watch), Vite dev server, and Electron. Electron waits for `dist/main/index.js` to exist before launching.

```
npm run build   # compile all three units
```

## Chapter rendering security model

Chapter XHTML is rendered inside a sandboxed `<iframe srcdoc="...">`.

**Why `srcdoc` instead of `src`**: the document has no URL, so there is no base URL for relative network requests to resolve against. Any asset that was not explicitly inlined simply fails to load silently.

**Sandbox attribute**: `sandbox="allow-same-origin"` and nothing else.

- No `allow-scripts` → zero JS execution inside the iframe.
- `allow-same-origin` keeps the iframe on the parent's origin so the React component can reach `iframe.contentDocument` and update the `#bookray-theme` style element directly. This enables live font/spacing changes without reloading the whole document.

**Asset pipeline before injection**:

1. `<script>` elements and `on*` event handler attributes are stripped.
2. `<link rel="stylesheet">` tags are replaced with inline `<style>` blocks. CSS `url()` references are resolved by the main process, relative to each CSS file's own ZIP path, and replaced with `data:` URLs before the text ever reaches the renderer.
3. Binary assets (`<img src>`, etc.) are replaced with `data:` URLs from the assets map returned by the IPC call.
4. External `href` attributes on `<a>` tags are removed.

---

## EPUB format primer

An EPUB file is a ZIP archive with a fixed entry point and a chain of XML files that describe the book's content and structure.

```
book.epub  (renamed ZIP)
│
├── mimetype                        ← must be first entry, uncompressed, value:
│                                     "application/epub+zip"
│
├── META-INF/
│   └── container.xml               ← only fixed-path file; points to the OPF
│           <rootfile full-path="OEBPS/content.opf" …/>
│
├── OEBPS/                          ← conventional; actual path comes from container.xml
│   ├── content.opf                 ← the package document (OPF)
│   │       <metadata>              ← title, authors, language, cover id, …
│   │       <manifest>              ← every resource in the book, each with:
│   │           <item id="ch1"      ←   id (used by spine to reference items)
│   │                 href="Text/chapter1.xhtml"
│   │                 media-type="application/xhtml+xml"
│   │                 properties="nav"/>   ← EPUB 3: "cover-image", "nav", …
│   │       <spine toc="ncx">       ← linear reading order: idref list
│   │           <itemref idref="ch1" linear="yes"/>
│   │
│   ├── nav.xhtml                   ← EPUB 3 table of contents (preferred)
│   │       <nav epub:type="toc">
│   │           <ol>
│   │               <li><a href="Text/chapter1.xhtml">Chapter 1</a></li>
│   │
│   ├── toc.ncx                     ← EPUB 2 table of contents (fallback)
│   │       <navMap>
│   │           <navPoint>
│   │               <navLabel><text>Chapter 1</text></navLabel>
│   │               <content src="Text/chapter1.xhtml"/>
│   │
│   ├── Text/
│   │   └── chapter1.xhtml          ← chapter body (XHTML, may reference CSS + images)
│   │
│   ├── Styles/
│   │   └── stylesheet.css
│   │
│   └── Images/
│       ├── cover.jpg
│       └── figure1.png
```

### Packing a directory into an EPUB

The `mimetype` file has two hard requirements that a plain `zip` invocation would violate if you're not careful:

- it must be the **first entry** in the Central Directory
- it must be **stored uncompressed** (compression method 0)

Most EPUB validators check both. BookRay's own parser enforces the value (`application/epub+zip`) but not the position or compression method, so a wrongly-packed file will still open — but it won't pass epubcheck.

**macOS / Linux (`zip`):**

```bash
cd my-book/

# 1. Create the archive with mimetype first, stored (-0), no extra metadata (-X)
zip -X0 ../my-book.epub mimetype

# 2. Append everything else, compressed (-9), recursively (-r)
zip -rX9 ../my-book.epub META-INF OEBPS
```

The `-X` flag strips the "extra field" that macOS's `zip` adds to every entry; some validators reject it.

**Python (cross-platform):**

```python
import os, zipfile

def pack_epub(source_dir: str, output_path: str) -> None:
    with zipfile.ZipFile(output_path, "w") as zf:
        # mimetype: first, uncompressed
        zf.write(
            os.path.join(source_dir, "mimetype"),
            "mimetype",
            compress_type=zipfile.ZIP_STORED,
        )
        # everything else: normal deflate
        for root, _, files in os.walk(source_dir):
            for name in files:
                full = os.path.join(root, name)
                arc = os.path.relpath(full, source_dir)
                if arc == "mimetype":
                    continue
                zf.write(full, arc, compress_type=zipfile.ZIP_DEFLATED)

pack_epub("my-book", "my-book.epub")
```

---

### How BookRay reads an EPUB

1. **ZIP** — `zip.ts` scans the Central Directory from the end of the file, reads each Local File Header, and decompresses entries (store or DEFLATE). The result is a `Map<zipPath, Buffer>`.

2. **container.xml** — parsed to locate the OPF file path. This is the only guaranteed entry point; everything else is discovered by following pointers.

3. **OPF** — parsed for `<metadata>`, `<manifest>`, and `<spine>`. Cover image is found via the `cover-image` property (EPUB 3) or a `<meta name="cover">` element (EPUB 2).

4. **TOC** — EPUB 3 `<nav epub:type="toc">` is preferred; falls back to the EPUB 2 NCX `<navMap>`.

5. **Chapter content** — on demand, the ZIP entry for the requested chapter path is read, its linked CSS and image assets are collected and converted to `data:` URLs, and the resulting bundle is sent to the renderer over IPC.
