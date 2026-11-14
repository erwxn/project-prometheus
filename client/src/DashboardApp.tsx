import { lazy, Suspense, useEffect, useSyncExternalStore } from 'react';
import App from './App';
import { DashboardProvider } from './DashboardProvider';
import { dashboardPage } from './dashboard-navigation';

const MonitorPage = lazy(() => import('./MonitorPage'));
const AnalyticsPage = lazy(() => import('./AnalyticsPage'));
const subscribe = (callback: () => void) => { window.addEventListener('popstate', callback); return () => window.removeEventListener('popstate', callback); };
const location = () => window.location.pathname;

export default function DashboardApp() {
  const path = useSyncExternalStore(subscribe, location);
  const page = dashboardPage(path);
  useEffect(() => {
    document.documentElement.classList.toggle('analytics-document', page !== 'explorer');
    document.title = page === 'monitor' ? 'Monitor recent fires | Prometheus' : page === 'analytics' ? 'Fire analytics | Prometheus' : 'Prometheus | Fire explorer';
    window.scrollTo(0, 0);
  }, [page]);
  return <DashboardProvider><Suspense fallback={<p className="page-loading" role="status">Loading view…</p>}>{page === 'monitor' ? <MonitorPage /> : page === 'analytics' ? <AnalyticsPage /> : <App />}</Suspense></DashboardProvider>;
}

