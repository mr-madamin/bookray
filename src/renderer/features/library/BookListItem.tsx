import type { LibraryBook } from './library.store';
import { useLibraryStore } from './library.store';
import { useThemeStore } from '../reader/theme.store';
import { THEMES } from '../reader/themes';

function BookIcon() {
  return (
    <svg viewBox="0 0 32 44" fill="none" className="w-5 h-7">
      <rect x="3" y="0" width="26" height="44" rx="2" fill="currentColor" opacity="0.3" />
      <rect x="0" y="0" width="5" height="44" rx="1" fill="currentColor" opacity="0.5" />
      <rect x="8" y="8" width="16" height="1.5" rx="0.75" fill="currentColor" opacity="0.6" />
      <rect x="8" y="13" width="12" height="1.5" rx="0.75" fill="currentColor" opacity="0.6" />
    </svg>
  );
}

interface Props {
  entry: LibraryBook;
}

export default function BookListItem({ entry }: Props) {
  const selectBook  = useLibraryStore((s) => s.selectBook);
  const selectedId  = useLibraryStore((s) => s.selectedId);
  const isSelected  = selectedId === entry.id;
  const theme       = THEMES[useThemeStore((s) => s.themeId)];

  const { metadata, coverDataUrl } = entry.book;
  const title  = metadata.title || 'Untitled';
  const author = metadata.authors[0] ?? 'Unknown author';

  return (
    <button
      onClick={() => selectBook(entry.id)}
      className="w-full text-left px-2 py-2 rounded-lg flex gap-3 items-center transition-colors border"
      style={isSelected
        ? { background: theme.selectionBg, borderColor: theme.selectionBorder }
        : { borderColor: 'transparent' }}
      onMouseEnter={(e) => { if (!isSelected) (e.currentTarget as HTMLButtonElement).style.background = theme.chromeBtnHover; }}
      onMouseLeave={(e) => { if (!isSelected) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
    >
      <div
        className="w-9 h-12 shrink-0 rounded overflow-hidden flex items-center justify-center"
        style={{ background: theme.chromeBtnHover, color: theme.chromeTextMuted }}
      >
        {coverDataUrl
          ? <img src={coverDataUrl} alt="" className="w-full h-full object-cover" />
          : <BookIcon />}
      </div>
      <div className="min-w-0 flex-1">
        <p
          className="text-sm font-medium truncate leading-snug"
          style={{ color: isSelected ? theme.selectionText : theme.chromeText }}
        >
          {title}
        </p>
        <p className="text-xs truncate mt-0.5" style={{ color: theme.chromeTextMuted }}>{author}</p>
      </div>
    </button>
  );
}
