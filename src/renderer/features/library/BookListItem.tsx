import type { LibraryBook } from './library.store';
import { useLibraryStore } from './library.store';

function BookIcon() {
  return (
    <svg viewBox="0 0 32 44" fill="none" className="w-5 h-7 text-slate-500">
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
  const selectBook = useLibraryStore((s) => s.selectBook);
  const selectedId = useLibraryStore((s) => s.selectedId);
  const isSelected = selectedId === entry.id;

  const { metadata, coverDataUrl } = entry.book;
  const title = metadata.title || 'Untitled';
  const author = metadata.authors[0] ?? 'Unknown author';

  return (
    <button
      onClick={() => selectBook(entry.id)}
      className={`w-full text-left px-2 py-2 rounded-lg flex gap-3 items-center transition-colors ${
        isSelected
          ? 'bg-amber-500/10 border border-amber-500/25'
          : 'hover:bg-slate-800/60 border border-transparent'
      }`}
    >
      <div className="w-9 h-12 flex-shrink-0 rounded overflow-hidden bg-slate-800 flex items-center justify-center">
        {coverDataUrl ? (
          <img src={coverDataUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <BookIcon />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p
          className={`text-sm font-medium truncate leading-snug ${
            isSelected ? 'text-amber-400' : 'text-slate-200'
          }`}
        >
          {title}
        </p>
        <p className="text-xs text-slate-500 truncate mt-0.5">{author}</p>
      </div>
    </button>
  );
}
