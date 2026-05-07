import { useState } from 'react';
import { useLibraryStore } from './library.store';
import BookListItem from './BookListItem';
import ChapterList from '../reader/ChapterList';

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5 text-blue-400 shrink-0">
        <circle cx="12" cy="12" r="4" fill="currentColor" />
        <line x1="12" y1="2" x2="12" y2="5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <line x1="12" y1="19" x2="12" y2="22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <line x1="2" y1="12" x2="5" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <line x1="19" y1="12" x2="22" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <line x1="4.93" y1="4.93" x2="7.05" y2="7.05" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <line x1="16.95" y1="16.95" x2="19.07" y2="19.07" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <line x1="4.93" y1="19.07" x2="7.05" y2="16.95" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <line x1="16.95" y1="7.05" x2="19.07" y2="4.93" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <span className="text-slate-100 font-semibold tracking-wide text-sm">BookRay</span>
    </div>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <p className="px-4 py-2 text-xs font-semibold uppercase tracking-widest text-slate-600">
      {children}
    </p>
  );
}

export default function Sidebar() {
  const books = useLibraryStore((s) => s.books);
  const selectedId = useLibraryStore((s) => s.selectedId);
  const selectedChapterPath = useLibraryStore((s) => s.selectedChapterPath);
  const addBook = useLibraryStore((s) => s.addBook);
  const selectChapter = useLibraryStore((s) => s.selectChapter);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedBook = books.find((b) => b.id === selectedId) ?? null;

  async function handleOpenEpub() {
    setError(null);
    setLoading(true);
    try {
      const filePath = await window.bookray.openFile();
      if (!filePath) return;
      const book = await window.bookray.loadEpub(filePath);
      addBook(filePath, book);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open book');
    } finally {
      setLoading(false);
    }
  }

  return (
    <aside className="w-60 shrink-0 bg-slate-900 border-r border-slate-800 flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-4 pt-5 pb-4 border-b border-slate-800 shrink-0">
        <div className="mb-4">
          <Logo />
        </div>
        <button
          onClick={handleOpenEpub}
          disabled={loading}
          className="w-full bg-blue-500 hover:bg-blue-400 active:bg-blue-600 disabled:opacity-50 text-white font-medium text-sm rounded-lg px-3 py-2 transition-colors cursor-pointer disabled:cursor-not-allowed"
        >
          {loading ? 'Loading…' : '+ Open EPUB'}
        </button>
        {error && <p className="mt-2 text-xs text-red-400 leading-snug">{error}</p>}
      </div>

      {/* Library section — capped height so the chapter list always has room */}
      <div className="shrink-0 flex flex-col" style={{ maxHeight: '35%' }}>
        <SectionLabel>Library</SectionLabel>
        <div className="overflow-y-auto px-2 pb-2 space-y-0.5">
          {books.length === 0 ? (
            <p className="text-xs text-slate-600 text-center mt-4 px-4 leading-relaxed">
              No books yet.
              <br />
              Open an EPUB to get started.
            </p>
          ) : (
            books.map((entry) => <BookListItem key={entry.id} entry={entry} />)
          )}
        </div>
      </div>

      {/* Chapter list — fills remaining space */}
      {selectedBook && (
        <div className="flex flex-col flex-1 min-h-0 border-t border-slate-800">
          <SectionLabel>Contents</SectionLabel>
          <div className="flex-1 overflow-y-auto px-2 pb-4">
            <ChapterList
              book={selectedBook.book}
              selectedPath={selectedChapterPath}
              onSelect={selectChapter}
            />
          </div>
        </div>
      )}
    </aside>
  );
}
