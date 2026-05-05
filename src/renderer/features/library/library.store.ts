import { create } from 'zustand';
import type { SerializedEpubBook } from '@shared/types';

export interface LibraryBook {
  id: string;
  filePath: string;
  book: SerializedEpubBook;
}

interface LibraryState {
  books: LibraryBook[];
  selectedId: string | null;
  selectedChapterPath: string | null;
  addBook: (filePath: string, book: SerializedEpubBook) => void;
  selectBook: (id: string) => void;
  selectChapter: (path: string | null) => void;
}

export const useLibraryStore = create<LibraryState>((set) => ({
  books: [],
  selectedId: null,
  selectedChapterPath: null,

  addBook: (filePath, book) => {
    const id = filePath;
    set((state) => {
      if (state.books.some((b) => b.id === id)) {
        return { selectedId: id, selectedChapterPath: null };
      }
      return {
        books: [...state.books, { id, filePath, book }],
        selectedId: id,
        selectedChapterPath: null,
      };
    });
  },

  // Switching books resets the chapter view back to the cover/metadata.
  selectBook: (id) => set({ selectedId: id, selectedChapterPath: null }),

  selectChapter: (path) => set({ selectedChapterPath: path }),
}));
