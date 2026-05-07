import type { LibraryBook } from '../library/library.store';

function CoverPlaceholder({ title }: { title: string }) {
  const letter = title.trim()[0]?.toUpperCase() ?? '?';
  return (
    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-700 to-slate-800">
      <span className="text-5xl font-bold text-slate-500 select-none">{letter}</span>
    </div>
  );
}

interface Props {
  entry: LibraryBook;
}

export default function BookHeader({ entry }: Props) {
  const { metadata, coverDataUrl } = entry.book;
  const title = metadata.title || 'Untitled';
  const authors = metadata.authors.length > 0 ? metadata.authors.join(', ') : 'Unknown author';

  return (
    <div className="flex gap-10 p-10 max-w-3xl">
      <div className="shrink-0 w-40 h-56 rounded-xl overflow-hidden shadow-2xl shadow-black/60 bg-slate-800">
        {coverDataUrl ? (
          <img src={coverDataUrl} alt={title} className="w-full h-full object-cover" />
        ) : (
          <CoverPlaceholder title={title} />
        )}
      </div>

      <div className="flex flex-col justify-center gap-2 min-w-0">
        {metadata.language && (
          <p className="text-xs font-semibold uppercase tracking-widest text-blue-400">
            {metadata.language}
          </p>
        )}
        <h1 className="text-3xl font-bold text-slate-100 leading-tight">{title}</h1>
        <p className="text-lg text-slate-400">{authors}</p>
        {metadata.publisher && (
          <p className="text-sm text-slate-500">{metadata.publisher}</p>
        )}
        {metadata.publishedDate && (
          <p className="text-sm text-slate-600">{metadata.publishedDate}</p>
        )}
        {metadata.description && (
          <p className="mt-2 text-sm text-slate-400 leading-relaxed line-clamp-5 max-w-prose">
            {metadata.description}
          </p>
        )}
      </div>
    </div>
  );
}
