import { create } from 'zustand';
import type { LibraryEntry } from '@shared/types';

// LibraryBook is the renderer-side alias for the shared LibraryEntry type.
// Components import LibraryBook from here for historical reasons; the shape is identical.
export type LibraryBook = LibraryEntry;

interface LibraryState {
  books: LibraryBook[];
  selectedId: string | null;
  selectedChapterPath: string | null;
  loadBooks: (entries: LibraryBook[]) => void;
  addBook: (entry: LibraryBook) => void;
  selectBook: (id: string) => void;
  selectChapter: (path: string | null) => void;
}

export const useLibraryStore = create<LibraryState>((set) => ({
  books: [],
  selectedId: null,
  selectedChapterPath: null,

  // Called once on startup with the full persisted library.
  loadBooks: (entries) => set({ books: entries }),

  addBook: (entry) =>
    set((state) => {
      if (state.books.some((b) => b.id === entry.id)) {
        // Already in library (e.g. duplicate import): just select it.
        return { selectedId: entry.id, selectedChapterPath: null };
      }
      return {
        books: [entry, ...state.books],
        selectedId: entry.id,
        selectedChapterPath: null,
      };
    }),

  selectBook: (id) => set({ selectedId: id, selectedChapterPath: null }),
  selectChapter: (path) => set({ selectedChapterPath: path }),
}));
