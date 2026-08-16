import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';

export type Theme = 'dark' | 'light';
export type SizeLevel = 'small' | 'medium' | 'large';

export const TERMINAL_FONT_OPTIONS = [
  { label: 'SF Mono', value: "ui-monospace, 'SFMono-Regular', Menlo, Monaco, Consolas, monospace" },
  { label: 'Menlo', value: "Menlo, Monaco, Consolas, monospace" },
  { label: 'Monaco', value: "Monaco, Menlo, Consolas, monospace" },
] as const;

export const TERMINAL_FONT_SIZES: Record<SizeLevel, number> = {
  small: 12,
  medium: 13,
  large: 15,
};

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  isDark: boolean;
  appSize: SizeLevel;
  setAppSize: (size: SizeLevel) => void;
  terminalSize: SizeLevel;
  setTerminalSize: (size: SizeLevel) => void;
  terminalFontFamily: string;
  setTerminalFontFamily: (font: string) => void;
  wrapTerminalLines: boolean;
  setWrapTerminalLines: (wrap: boolean) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEYS = {
  theme: 'launcher_theme',
  appSize: 'horselaunch_app_size',
  terminalSize: 'horselaunch_terminal_size',
  terminalFont: 'horselaunch_terminal_font_family',
  wrapTerminal: 'horselaunch_terminal_wrap',
};

const storedSize = (key: string): SizeLevel => {
  const value = localStorage.getItem(key);
  return value === 'small' || value === 'large' ? value : 'medium';
};

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    const stored = localStorage.getItem(STORAGE_KEYS.theme);
    if (stored === 'light' || stored === 'dark') return stored;
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });
  const [appSize, setAppSize] = useState<SizeLevel>(() => storedSize(STORAGE_KEYS.appSize));
  const [terminalSize, setTerminalSize] = useState<SizeLevel>(() => storedSize(STORAGE_KEYS.terminalSize));
  const [terminalFontFamily, setTerminalFontFamily] = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEYS.terminalFont);
    return TERMINAL_FONT_OPTIONS.some(option => option.value === stored) ? stored! : TERMINAL_FONT_OPTIONS[0].value;
  });
  const [wrapTerminalLines, setWrapTerminalLines] = useState(() => localStorage.getItem(STORAGE_KEYS.wrapTerminal) !== 'false');

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem(STORAGE_KEYS.theme, theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.dataset.appSize = appSize;
    localStorage.setItem(STORAGE_KEYS.appSize, appSize);
  }, [appSize]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.terminalSize, terminalSize);
  }, [terminalSize]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.terminalFont, terminalFontFamily);
  }, [terminalFontFamily]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.wrapTerminal, String(wrapTerminalLines));
  }, [wrapTerminalLines]);

  const toggleTheme = useCallback(() => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  }, []);

  return (
    <ThemeContext.Provider value={{
      theme,
      setTheme,
      toggleTheme,
      isDark: theme === 'dark',
      appSize,
      setAppSize,
      terminalSize,
      setTerminalSize,
      terminalFontFamily,
      setTerminalFontFamily,
      wrapTerminalLines,
      setWrapTerminalLines,
    }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
