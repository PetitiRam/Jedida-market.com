import { createContext, useContext, useEffect, useState, useCallback } from 'react';

const ThemeContext = createContext({ mode: 'system', resolved: 'light', setMode: () => {} });

const STORAGE_KEY = 'jedida_theme_mode';

function resolveMode(mode) {
  if (mode === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return mode;
}

export function ThemeProvider({ children }) {
  const [mode, setModeState] = useState(() => localStorage.getItem(STORAGE_KEY) || 'system');
  const [resolved, setResolved] = useState(() => resolveMode(mode));

  const applyTheme = useCallback((m) => {
    const next = resolveMode(m);
    setResolved(next);
    document.documentElement.setAttribute('data-theme', next);
  }, []);

  useEffect(() => { applyTheme(mode); }, [mode, applyTheme]);

  useEffect(() => {
    if (mode !== 'system') return undefined;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => applyTheme('system');
    mq.addEventListener ? mq.addEventListener('change', handler) : mq.addListener(handler);
    return () => {
      mq.removeEventListener ? mq.removeEventListener('change', handler) : mq.removeListener(handler);
    };
  }, [mode, applyTheme]);

  const setMode = (m) => {
    setModeState(m);
    localStorage.setItem(STORAGE_KEY, m);
  };

  return (
    <ThemeContext.Provider value={{ mode, resolved, setMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
