import type { SerializedEpubBook } from '@shared/types';

interface ChapterEntry {
  path: string;
  label: string;
  depth: number;
}

function flattenToc(
  items: SerializedEpubBook['toc'],
  depth = 0,
  out: ChapterEntry[] = [],
): ChapterEntry[] {
  for (const item of items) {
    if (item.label.trim()) {
      out.push({ path: item.path, label: item.label.trim(), depth });
    }
    if (item.children.length > 0) {
      flattenToc(item.children, depth + 1, out);
    }
  }
  return out;
}

export function countChapters(book: SerializedEpubBook): number {
  return buildEntries(book).length;
}

function buildEntries(book: SerializedEpubBook): ChapterEntry[] {
  if (book.toc.length > 0) {
    return flattenToc(book.toc);
  }
  // Fallback: use linear spine items
  return book.spine
    .filter((c) => c.linear)
    .map((c, i) => ({ path: c.path, label: `Chapter ${i + 1}`, depth: 0 }));
}

interface Props {
  book: SerializedEpubBook;
  selectedPath: string | null;
  onSelect: (path: string) => void;
}

export default function ChapterList({ book, selectedPath, onSelect }: Props) {
  const entries = buildEntries(book);

  return (
    <div className="space-y-px">
      {entries.map((entry, i) => {
        const isSelected = selectedPath === entry.path;
        return (
          <button
            key={`${entry.path}-${i}`}
            onClick={() => onSelect(entry.path)}
            title={entry.label}
            className={`w-full text-left rounded px-2 py-1.5 text-xs leading-snug transition-colors ${
              isSelected
                ? 'bg-blue-500/10 text-blue-400 border-l-2 border-blue-500'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border-l-2 border-transparent'
            }`}
            style={{ paddingLeft: `${0.5 + entry.depth * 0.75}rem` }}
          >
            <span className="truncate block">{entry.label}</span>
          </button>
        );
      })}
    </div>
  );
}
