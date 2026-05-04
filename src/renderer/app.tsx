import { useLibraryStore } from './features/library/library.store';
import Sidebar from './features/library/Sidebar';
import BookHeader from './features/reader/BookHeader';

function EmptyState() {
  return (
    <div className="h-full flex items-center justify-center">
      <div className="text-center select-none">
        <svg
          viewBox="0 0 64 64"
          fill="none"
          className="w-16 h-16 mx-auto mb-4 text-slate-700"
        >
          <rect x="8" y="6" width="36" height="48" rx="3" fill="currentColor" opacity="0.4" />
          <rect x="4" y="6" width="6" height="48" rx="2" fill="currentColor" opacity="0.6" />
          <rect x="20" y="10" width="20" height="2" rx="1" fill="currentColor" opacity="0.5" />
          <rect x="20" y="16" width="14" height="2" rx="1" fill="currentColor" opacity="0.5" />
          <rect x="16" y="28" width="36" height="48" rx="3" fill="currentColor" opacity="0.25" />
          <rect x="12" y="28" width="6" height="48" rx="2" fill="currentColor" opacity="0.35" />
        </svg>
        <p className="text-slate-400 font-medium">No book selected</p>
        <p className="text-slate-600 text-sm mt-1">Open an EPUB from the sidebar</p>
      </div>
    </div>
  );
}

export default function App() {
  const books = useLibraryStore((s) => s.books);
  const selectedId = useLibraryStore((s) => s.selectedId);
  const selectedBook = books.find((b) => b.id === selectedId) ?? null;

  return (
    <div className="flex h-screen bg-slate-950 text-white overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        {selectedBook ? <BookHeader entry={selectedBook} /> : <EmptyState />}
      </main>
    </div>
  );
}
