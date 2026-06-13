export type ThemeId = 'dark' | 'sepia' | 'paper';

export interface Theme {
  id: ThemeId;
  name: string;
  // Reading surface + app main area
  bg: string;
  text: string;
  heading: string;
  link: string;
  accent: string;       // badges, highlights — replaces hardcoded blue
  blockquoteBorder: string;
  blockquoteText: string;
  codeBg: string;
  // Reader chrome (controls bar, pagination bar)
  chromeBg: string;
  chromeBorder: string;
  chromeText: string;
  chromeTextMuted: string;
  chromeBtnHover: string;
  // Selection state (library items, chapter list)
  selectionBg: string;
  selectionBorder: string;
  selectionText: string;
}

export const THEMES: Record<ThemeId, Theme> = {
  dark: {
    id: 'dark',
    name: 'Dark',
    bg: '#0f172a',
    text: '#cbd5e1',
    heading: '#f1f5f9',
    link: '#60a5fa',
    accent: '#60a5fa',
    blockquoteBorder: '#334155',
    blockquoteText: '#94a3b8',
    codeBg: '#1e293b',
    chromeBg: '#0f172a',
    chromeBorder: '#1e293b',
    chromeText: '#94a3b8',
    chromeTextMuted: '#475569',
    chromeBtnHover: '#1e293b',
    selectionBg: 'rgba(96,165,250,0.1)',
    selectionBorder: 'rgba(96,165,250,0.3)',
    selectionText: '#60a5fa',
  },
  sepia: {
    id: 'sepia',
    name: 'Sepia',
    bg: '#f5ede0',
    text: '#3d2a18',
    heading: '#2b1d0e',
    link: '#8b5e3c',
    accent: '#8b5e3c',
    blockquoteBorder: '#c4a882',
    blockquoteText: '#7a5a42',
    codeBg: '#e8ddd0',
    chromeBg: '#ede3d2',
    chromeBorder: '#d4c4ad',
    chromeText: '#7a5a42',
    chromeTextMuted: '#a08060',
    chromeBtnHover: '#ddd0bc',
    selectionBg: 'rgba(139,94,60,0.1)',
    selectionBorder: 'rgba(139,94,60,0.35)',
    selectionText: '#8b5e3c',
  },
  paper: {
    id: 'paper',
    name: 'Paper',
    bg: '#faf9f5',
    text: '#333333',
    heading: '#1a1a1a',
    link: '#2563eb',
    accent: '#6b6352',
    blockquoteBorder: '#c8c4bc',
    blockquoteText: '#55524a',
    codeBg: '#eeecea',
    chromeBg: '#f0ede6',
    chromeBorder: '#d8d4cc',
    chromeText: '#55524a',
    chromeTextMuted: '#9c9890',
    chromeBtnHover: '#e0ddd6',
    selectionBg: 'rgba(37,99,235,0.08)',
    selectionBorder: 'rgba(37,99,235,0.25)',
    selectionText: '#2563eb',
  },
};

export const THEME_IDS = Object.keys(THEMES) as ThemeId[];
