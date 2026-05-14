import type { LibraryBook } from '../library/library.store';
import { useThemeStore } from './theme.store';
import { THEMES } from './themes';

interface Props {
  entry: LibraryBook;
}

export default function BookHeader({ entry }: Props) {
  const theme = THEMES[useThemeStore((s) => s.themeId)];
  const { metadata, coverDataUrl } = entry.book;
  const title   = metadata.title || 'Untitled';
  const authors = metadata.authors.length > 0 ? metadata.authors.join(', ') : 'Unknown author';

  return (
    <div className="flex gap-10 p-10 max-w-3xl">
      <div
        className="shrink-0 w-40 h-56 rounded-xl overflow-hidden shadow-2xl"
        style={{ background: theme.chromeBtnHover, boxShadow: `0 25px 50px -12px ${theme.chromeBorder}` }}
      >
        {coverDataUrl ? (
          <img src={coverDataUrl} alt={title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center" style={{ background: theme.chromeBtnHover }}>
            <span className="text-5xl font-bold select-none" style={{ color: theme.chromeTextMuted }}>
              {title.trim()[0]?.toUpperCase() ?? '?'}
            </span>
          </div>
        )}
      </div>

      <div className="flex flex-col justify-center gap-2 min-w-0">
        {metadata.language && (
          <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: theme.accent }}>
            {metadata.language}
          </p>
        )}
        <h1 className="text-3xl font-bold leading-tight" style={{ color: theme.heading }}>{title}</h1>
        <p className="text-lg" style={{ color: theme.text }}>{authors}</p>
        {metadata.publisher && (
          <p className="text-sm" style={{ color: theme.chromeText }}>{metadata.publisher}</p>
        )}
        {metadata.publishedDate && (
          <p className="text-sm" style={{ color: theme.chromeTextMuted }}>{metadata.publishedDate}</p>
        )}
        {metadata.description && (
          <p className="mt-2 text-sm leading-relaxed line-clamp-5 max-w-prose" style={{ color: theme.text }}>
            {metadata.description}
          </p>
        )}
      </div>
    </div>
  );
}
