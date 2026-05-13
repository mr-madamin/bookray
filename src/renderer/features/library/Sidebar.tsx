import { useState } from 'react';
import { useLibraryStore } from './library.store';
import { useAudioStore } from '../audio/audio.store';
import BookListItem from './BookListItem';
import ChapterList, { countChapters } from '../reader/ChapterList';
import TrackList from '../audio/TrackList';

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5 text-blue-400 shrink-0">
        <circle cx="12" cy="12" r="4" fill="currentColor" />
        <line x1="12" y1="2"  x2="12" y2="5"  stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <line x1="12" y1="19" x2="12" y2="22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <line x1="2"  y1="12" x2="5"  y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <line x1="19" y1="12" x2="22" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <line x1="4.93"  y1="4.93"  x2="7.05"  y2="7.05"  stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <line x1="16.95" y1="16.95" x2="19.07" y2="19.07" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <line x1="4.93"  y1="19.07" x2="7.05"  y2="16.95" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <line x1="16.95" y1="7.05"  x2="19.07" y2="4.93"  stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
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
  const books               = useLibraryStore((s) => s.books);
  const selectedId          = useLibraryStore((s) => s.selectedId);
  const selectedChapterPath = useLibraryStore((s) => s.selectedChapterPath);
  const addBook             = useLibraryStore((s) => s.addBook);
  const selectChapter       = useLibraryStore((s) => s.selectChapter);

  const tracks    = useAudioStore((s) => s.tracks);
  const setTracks = useAudioStore((s) => s.setTracks);
  const hasAudio  = tracks.length > 0;

  const [tab, setTab]                   = useState<'text' | 'audio'>('text');
  const [loading, setLoading]           = useState(false);
  const [audioLoading, setAudioLoading] = useState(false);
  const [error, setError]               = useState<string | null>(null);

  const selectedBook = books.find((b) => b.id === selectedId) ?? null;

  async function handleOpenEpub() {
    setError(null);
    setLoading(true);
    try {
      const originalPath = await window.bookray.openFile();
      if (!originalPath) return;
      const entry = await window.bookray.importBook(originalPath);
      addBook(entry);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open book');
    } finally {
      setLoading(false);
    }
  }

  async function handleImportAudio() {
    if (!selectedId) return;
    setAudioLoading(true);
    try {
      const newTracks = await window.bookray.audioImportFolder(selectedId);
      if (newTracks.length > 0) {
        setTracks([...tracks, ...newTracks]);
        setTab('audio');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import audio');
    } finally {
      setAudioLoading(false);
    }
  }

  return (
    <aside className="w-60 shrink-0 bg-slate-900 border-r border-slate-800 flex flex-col h-full overflow-hidden">

      {/* ── Header ── */}
      <div className="px-4 pt-5 pb-4 border-b border-slate-800 shrink-0">
        <div className="mb-4"><Logo /></div>
        <button
          onClick={handleOpenEpub}
          disabled={loading}
          className="w-full bg-blue-500 hover:bg-blue-400 active:bg-blue-600 disabled:opacity-50
                     text-white font-medium text-sm rounded-lg px-3 py-2 transition-colors
                     cursor-pointer disabled:cursor-not-allowed"
        >
          {loading ? 'Loading…' : '+ Open EPUB'}
        </button>
        {error && <p className="mt-2 text-xs text-red-400 leading-snug">{error}</p>}
      </div>

      {/* ── Library ── */}
      <div className="shrink-0 flex flex-col" style={{ maxHeight: '35%' }}>
        <SectionLabel>Library</SectionLabel>
        <div className="overflow-y-auto px-2 pb-2 space-y-0.5">
          {books.length === 0 ? (
            <p className="text-xs text-slate-600 text-center mt-4 px-4 leading-relaxed">
              No books yet.<br />Open an EPUB to get started.
            </p>
          ) : (
            books.map((entry) => <BookListItem key={entry.id} entry={entry} />)
          )}
        </div>
      </div>

      {/* ── Tabbed contents (when a book is selected) ── */}
      {selectedBook && (
        <div className="flex flex-col flex-1 min-h-0 border-t border-slate-800">

          {/* Tab bar */}
          <div className="flex shrink-0 gap-1 px-3 pt-2 pb-1">
            {(['text', 'audio'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors capitalize ${
                  tab === t
                    ? 'bg-slate-700 text-slate-200'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {t === 'text'
  ? `Text (${countChapters(selectedBook.book)})`
  : hasAudio ? `Audio (${tracks.length})` : 'Audio'}
              </button>
            ))}
          </div>

          {tab === 'text' ? (
            <div className="flex-1 overflow-y-auto px-2 pb-4">
              <ChapterList
                book={selectedBook.book}
                selectedPath={selectedChapterPath}
                onSelect={selectChapter}
              />
            </div>
          ) : (
            <div className="flex flex-col flex-1 min-h-0">
              {/* Import / add-more row */}
              <div className="shrink-0 px-3 py-2">
                {hasAudio ? (
                  <div className="flex items-center gap-2 px-1">
                    <svg viewBox="0 0 20 20" fill="none" className="w-3.5 h-3.5 text-blue-400 shrink-0">
                      <rect x="1"  y="7" width="2" height="6"  rx="1" fill="currentColor" />
                      <rect x="5"  y="4" width="2" height="12" rx="1" fill="currentColor" />
                      <rect x="9"  y="2" width="2" height="16" rx="1" fill="currentColor" />
                      <rect x="13" y="5" width="2" height="10" rx="1" fill="currentColor" />
                      <rect x="17" y="8" width="2" height="4"  rx="1" fill="currentColor" />
                    </svg>
                    <span className="text-xs text-blue-400 font-medium flex-1">
                      {tracks.length} track{tracks.length !== 1 ? 's' : ''}
                    </span>
                    <button
                      onClick={handleImportAudio}
                      disabled={audioLoading}
                      className="text-xs text-slate-500 hover:text-slate-300 transition-colors disabled:opacity-50"
                      title="Add more audio tracks"
                    >
                      + Add
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={handleImportAudio}
                    disabled={audioLoading}
                    className="w-full flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg
                               border border-dashed border-slate-700 text-slate-500 hover:border-slate-500
                               hover:text-slate-300 transition-colors text-xs disabled:opacity-50
                               disabled:cursor-not-allowed"
                  >
                    {audioLoading ? 'Importing…' : (
                      <>
                        <svg viewBox="0 0 16 16" fill="none" className="w-3.5 h-3.5">
                          <path d="M8 3v7m0 0-2.5-2.5M8 10l2.5-2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          <path d="M3 12.5h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
                        Import Audiobook Folder
                      </>
                    )}
                  </button>
                )}
              </div>
              <div className="flex-1 overflow-y-auto px-2 pb-4">
                <TrackList />
              </div>
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
