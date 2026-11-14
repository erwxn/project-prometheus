interface MapAppearanceProps {
  value: 'light' | 'dark';
  onChange(value: 'light' | 'dark'): void;
}

/** Selects the basemap appearance without changing the surrounding interface. */
export function MapAppearance({ value, onChange }: MapAppearanceProps) {
  return <div className="map-appearance" role="group" aria-label="Map appearance">
    {(['light', 'dark'] as const).map(theme => <button key={theme} type="button" aria-label={`${theme === 'light' ? 'Light' : 'Dark'} map`} aria-pressed={value === theme} onClick={() => onChange(theme)}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {theme === 'light' ? <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" /></> : <path d="M20.7 13.3A9 9 0 0 1 10.7 3.3a9 9 0 1 0 10 10Z" />}
      </svg><span>{theme === 'light' ? 'Light' : 'Dark'}</span>
    </button>)}
  </div>;
}
