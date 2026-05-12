import { useEffect, useState } from 'react';
import { useLibraryStore } from './features/library/library.store';
import Sidebar from './features/library/Sidebar';
import BookHeader from './features/reader/BookHeader';
import ChapterRenderer from './features/reader/ChapterRenderer';

function EmptyState() {
  return (
    <div className="h-full flex items-center justify-center">
      <div className="text-center select-none">
        <svg
          viewBox="0 0 64 64"
          fill="none"
          className="w-16 h-16 mx-auto mb-4 text-slate-700"
        >
          <rect
            x="8"
            y="6"
            width="36"
            height="48"
            rx="3"
            fill="currentColor"
            opacity="0.4"
          />
          <rect
            x="4"
            y="6"
            width="6"
            height="48"
            rx="2"
            fill="currentColor"
            opacity="0.6"
          />
          <rect
            x="20"
            y="10"
            width="20"
            height="2"
            rx="1"
            fill="currentColor"
            opacity="0.5"
          />
          <rect
            x="20"
            y="16"
            width="14"
            height="2"
            rx="1"
            fill="currentColor"
            opacity="0.5"
          />
          <rect
            x="16"
            y="28"
            width="36"
            height="48"
            rx="3"
            fill="currentColor"
            opacity="0.25"
          />
          <rect
            x="12"
            y="28"
            width="6"
            height="48"
            rx="2"
            fill="currentColor"
            opacity="0.35"
          />
        </svg>
        <p className="text-slate-400 font-medium">No book selected</p>
        <p className="text-slate-600 text-sm mt-1">
          Open an EPUB from the sidebar
        </p>
      </div>
    </div>
  );
}

export default function App() {
  const books = useLibraryStore((s) => s.books);
  const selectedId = useLibraryStore((s) => s.selectedId);
  const selectedChapterPath = useLibraryStore((s) => s.selectedChapterPath);
  const addBook = useLibraryStore((s) => s.addBook);
  const loadBooks = useLibraryStore((s) => s.loadBooks);
  const selectedBook = books.find((b) => b.id === selectedId) ?? null;

  const showReader = selectedBook !== null && selectedChapterPath !== null;

  // Restore library from DB on first mount.
  useEffect(() => {
    window.bookray.loadLibrary().then(loadBooks);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [isDragging, setIsDragging] = useState(false);

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    if ([...e.dataTransfer.items].some((item) => item.kind === 'file')) {
      setIsDragging(true);
    }
  }

  function handleDragLeave(e: React.DragEvent) {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragging(false);
    }
  }

  async function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const epubFiles = [...e.dataTransfer.files].filter((f) =>
      f.name.toLowerCase().endsWith('.epub'),
    );
    if (!epubFiles.length) return;
    const originalPath = window.bookray.getFilePath(epubFiles[0]);
    const entry = await window.bookray.importBook(originalPath);
    addBook(entry);
  }

  return (
    <div
      className="flex h-screen bg-slate-950 text-white overflow-hidden relative"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDragging && (
        <div className="absolute inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center pointer-events-none">
          <div className="border-2 border-dashed border-blue-500 rounded-2xl px-16 py-12 flex flex-col items-center gap-3">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              className="w-10 h-10 text-blue-400"
            >
              <path
                d="M12 16V8m0 0-3 3m3-3 3 3"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M4 16.5A3.5 3.5 0 0 0 7.5 20h9a3.5 3.5 0 0 0 3.5-3.5c0-1.63-1.1-3-2.6-3.4"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
              />
            </svg>
            <p className="text-blue-400 font-medium text-sm">
              Drop EPUB to open
            </p>
          </div>
        </div>
      )}
      <Sidebar />
      {/* When the reader is active the main area must NOT scroll — the iframe
          handles its own scrolling internally. */}
      <main
        className={`flex-1 min-w-0 ${showReader ? 'overflow-hidden flex flex-col' : 'overflow-y-auto'}`}
      >
        {!selectedBook && <EmptyState />}
        {selectedBook && !selectedChapterPath && (
          <BookHeader entry={selectedBook} />
        )}
        {showReader && (
          <ChapterRenderer
            entry={selectedBook}
            chapterPath={selectedChapterPath}
          />
        )}
      </main>
    </div>
  );
}
