import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ThemeId } from './themes';

interface ThemeState {
  themeId: ThemeId;
  setTheme: (id: ThemeId) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      themeId: 'dark',
      setTheme: (id) => set({ themeId: id }),
    }),
    { name: 'bookray-theme' },
  ),
);
