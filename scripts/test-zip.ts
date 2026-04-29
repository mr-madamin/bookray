import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseZip } from '../src/main/core/zip.ts';

const epubPath = process.argv[2];
if (!epubPath) {
  console.error('Usage: node scripts/test-zip.ts <path-to-epub-or-zip>');
  process.exit(1);
}

const buf = readFileSync(resolve(epubPath));
console.log(`Parsing ${epubPath} (${buf.length.toLocaleString()} bytes)...\n`);

const entries = parseZip(buf);
console.log(`Found ${entries.size} entries:\n`);

const methodName = (m: number): string =>
  m === 0 ? 'stored' : m === 8 ? 'deflate' : `m${m}`;

let totalUncompressed = 0;
let totalCompressed = 0;
for (const entry of entries.values()) {
  totalUncompressed += entry.uncompressedSize;
  totalCompressed += entry.compressedSize;

  const ratio =
    entry.uncompressedSize > 0
      ? `${((entry.compressedSize / entry.uncompressedSize) * 100).toFixed(0)}%`
      : '-';

  console.log(
    `  ${entry.uncompressedSize.toString().padStart(10)} B  ` +
      `${methodName(entry.compressionMethod).padEnd(7)}  ` +
      `${ratio.padStart(4)}  ${entry.filename}`,
  );
}

console.log(
  `\nTotal: ${totalUncompressed.toLocaleString()} B uncompressed, ` +
    `${totalCompressed.toLocaleString()} B compressed`,
);

// EPUB sanity: the spec requires "mimetype" be the first entry, stored
// (not deflated), with the literal contents "application/epub+zip".
const mimetype = entries.get('mimetype');
if (mimetype) {
  const text = mimetype.data.toString('utf8').trim();
  console.log(`\nmimetype entry: "${text}" (compression: ${methodName(mimetype.compressionMethod)})`);
}
