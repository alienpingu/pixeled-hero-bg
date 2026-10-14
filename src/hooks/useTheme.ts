import { useCallback, useEffect, useState } from 'react';
import { getTheme, type Theme, type ThemeId } from '../themes';

const STORAGE_KEY = 'pixeled-theme';

function readStoredTheme(): Theme {
  try {
    return getTheme(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return getTheme(null);
  }
}

/** Active theme state, persisted to localStorage and mirrored onto CSS vars. */
export function useTheme(): { theme: Theme; setThemeId: (id: ThemeId) => void } {
  const [theme, setTheme] = useState<Theme>(readStoredTheme);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--accent', theme.accent);
    root.style.setProperty('--bg', theme.background);
    root.style.setProperty('--text', theme.text);
    document.body.style.backgroundColor = theme.background;
    document.body.style.color = theme.text;
    try {
      window.localStorage.setItem(STORAGE_KEY, theme.id);
    } catch {
      /* storage unavailable — keep in-memory selection */
    }
  }, [theme]);

  const setThemeId = useCallback((id: ThemeId) => {
    setTheme(getTheme(id));
  }, []);

  return { theme, setThemeId };
}
