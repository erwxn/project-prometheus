export type Theme = 'light' | 'dark';
export type MapThemePreference = Theme | 'match';

export interface ThemeProps {
  theme: Theme;
  setTheme(theme: Theme): void;
  mapTheme: Theme;
  mapPreference: MapThemePreference;
  setMapPreference(preference: MapThemePreference): void;
}

const themeKey = 'prometheus-theme';
const mapThemeKey = 'prometheus-map-theme';

export function readMapPreference(): MapThemePreference {
  try {
    const saved = window.localStorage.getItem(mapThemeKey);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch { /* Match the interface if storage is unavailable. */ }
  return 'match';
}

export function saveMapPreference(preference: MapThemePreference) {
  try { window.localStorage.setItem(mapThemeKey, preference); } catch { /* Keep the choice for this session. */ }
}

export function readTheme(): Theme {
  try {
    const saved = window.localStorage.getItem(themeKey);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch { /* The app can still use the system preference. */ }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
}

export function saveTheme(theme: Theme) {
  try { window.localStorage.setItem(themeKey, theme); } catch { /* Keep the choice for this session. */ }
}
