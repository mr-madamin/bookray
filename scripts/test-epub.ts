import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEpub } from '../src/main/core/epub.ts';
import type { TocItem } from '../src/shared/types/epub.types.ts';

const epubPath = process.argv[2];
if (!epubPath) {
  console.error('Usage: node scripts/test-epub.ts <path-to-epub>');
  process.exit(1);
}

const buf = readFileSync(resolve(epubPath));
const book = parseEpub(buf);

console.log(`EPUB ${book.version}.x  •  ${book.opfPath}\n`);

console.log('━━━ Metadata ━━━');
console.log(`Title:       ${book.metadata.title}`);
console.log(`Author(s):   ${book.metadata.authors.join(', ') || '(none)'}`);
console.log(`Language:    ${book.metadata.language}`);
if (book.metadata.publisher) console.log(`Publisher:   ${book.metadata.publisher}`);
if (book.metadata.identifier) console.log(`Identifier:  ${book.metadata.identifier}`);
if (book.metadata.publishedDate) console.log(`Published:   ${book.metadata.publishedDate}`);
if (book.metadata.coverPath) console.log(`Cover:       ${book.metadata.coverPath}`);
if (book.metadata.description) {
  const oneLine = book.metadata.description.replace(/\s+/g, ' ').trim();
  const truncated = oneLine.length > 200 ? oneLine.slice(0, 200) + '…' : oneLine;
  console.log(`Description: ${truncated}`);
}

console.log(`\n━━━ Manifest (${book.manifest.size} items) ━━━`);
for (const item of book.manifest.values()) {
  const props = item.properties.length ? `  [${item.properties.join(', ')}]` : '';
  console.log(`  ${item.id.padEnd(24)}  ${item.mediaType.padEnd(28)}  ${item.path}${props}`);
}

console.log(`\n━━━ Spine (${book.spine.length} entries, reading order) ━━━`);
book.spine.forEach((ch, i) => {
  const aux = ch.linear ? '' : '  (linear=no)';
  console.log(`  ${String(i + 1).padStart(3)}.  ${ch.path}${aux}`);
});

console.log(`\n━━━ TOC (${countToc(book.toc)} entries) ━━━`);
if (book.toc.length === 0) {
  console.log('  (none found)');
} else {
  printToc(book.toc, 0);
}

function printToc(items: TocItem[], depth: number): void {
  for (const item of items) {
    const indent = '  '.repeat(depth + 1);
    const target = item.fragment ? `${item.path}#${item.fragment}` : item.path;
    console.log(`${indent}• ${item.label}  →  ${target}`);
    if (item.children.length > 0) printToc(item.children, depth + 1);
  }
}

function countToc(items: TocItem[]): number {
  let n = items.length;
  for (const item of items) n += countToc(item.children);
  return n;
}
