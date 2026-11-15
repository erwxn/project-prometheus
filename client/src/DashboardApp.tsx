import { lazy, Suspense, useEffect, useLayoutEffect, useState, useSyncExternalStore } from 'react';
import App from './App';
import { DashboardProvider } from './DashboardProvider';
import { dashboardPage } from './dashboard-navigation';
import { applyTheme, readMapPreference, readTheme, saveMapPreference, saveTheme, type MapThemePreference, type Theme, type ThemeProps } from './theme';

const MonitorPage = lazy(() => import('./MonitorPage'));
const AnalyticsPage = lazy(() => import('./AnalyticsPage'));
const subscribe = (callback: () => void) => { window.addEventListener('popstate', callback); return () => window.removeEventListener('popstate', callback); };
const location = () => window.location.pathname;

export default function DashboardApp() {
  const path = useSyncExternalStore(subscribe, location);
  const page = dashboardPage(path);
  const [theme, updateTheme] = useState(readTheme);
  const [mapPreference, updateMapPreference] = useState(readMapPreference);
  useLayoutEffect(() => applyTheme(theme), [theme]);
  function setTheme(next: Theme) {
    saveTheme(next);
    updateTheme(next);
  }
  function setMapPreference(next: MapThemePreference) {
    saveMapPreference(next);
    updateMapPreference(next);
  }
  const appearance: ThemeProps = { theme, setTheme, mapPreference, setMapPreference, mapTheme: mapPreference === 'match' ? theme : mapPreference };
  useEffect(() => {
    document.documentElement.classList.toggle('analytics-document', page !== 'explorer');
    document.title = page === 'monitor' ? 'Monitor recent fires | Prometheus' : page === 'analytics' ? 'Fire analytics | Prometheus' : 'Prometheus | Fire explorer';
    window.scrollTo(0, 0);
  }, [page]);
  return <DashboardProvider><Suspense fallback={<p className="page-loading" role="status">Loading view…</p>}>{page === 'monitor' ? <MonitorPage {...appearance} /> : page === 'analytics' ? <AnalyticsPage {...appearance} /> : <App {...appearance} />}</Suspense></DashboardProvider>;
}

