import type { SerializedEpubBook } from '@shared/types';
import { useThemeStore } from './theme.store';
import { THEMES } from './themes';

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
  const theme   = THEMES[useThemeStore((s) => s.themeId)];
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
            className="w-full text-left rounded px-2 py-1.5 text-xs leading-snug transition-colors border-l-2 cursor-pointer"
            style={{
              paddingLeft: `${0.5 + entry.depth * 0.75}rem`,
              background: isSelected ? 'rgba(59,130,246,0.1)' : 'transparent',
              color: isSelected ? '#60a5fa' : theme.chromeText,
              borderColor: isSelected ? '#3b82f6' : 'transparent',
            }}
            onMouseEnter={(e) => { if (!isSelected) (e.currentTarget as HTMLButtonElement).style.background = theme.chromeBtnHover; }}
            onMouseLeave={(e) => { if (!isSelected) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
          >
            <span className="truncate block">{entry.label}</span>
          </button>
        );
      })}
    </div>
  );
}
