import { navigateDashboard } from './dashboard-navigation';

const pages = [
  { id: 'home', href: '/', label: 'Home' },
  { id: 'explorer', href: '/explore/', label: 'Explore' },
  { id: 'analytics', href: '/analytics/', label: 'Analyze' },
  { id: 'monitor', href: '/monitor/', label: 'Monitor' },
  { id: 'about', href: '/about/', label: 'About the data' },
] as const;

export function SiteBrand({ heading = false }: { heading?: boolean }) {
  const BrandName = heading ? 'h1' : 'p';
  return (
    <div className="brand">
      <svg className="brand-mark" viewBox="0 0 40 40" fill="none" aria-hidden="true">
        <circle cx="20" cy="20" r="15" stroke="currentColor" strokeWidth="1.2" />
        <ellipse cx="20" cy="20" rx="7" ry="19" stroke="currentColor" transform="rotate(40 20 20)" />
        <path d="M14 28 20 11l6 17-6-4-6 4Z" fill="currentColor" />
      </svg>
      <div><BrandName className="brand-name">Prometheus</BrandName><p>Earth observation platform</p></div>
    </div>
  );
}

export function SiteNavigation({ current }: { current: (typeof pages)[number]['id'] }) {
  const links = pages.map(page => <a key={page.id} href={page.href} onClick={event => navigateDashboard(event, page.href)} className={current === page.id ? 'active' : undefined} aria-current={current === page.id ? 'page' : undefined}>{page.label}</a>);

  return (
    <>
      <nav className="header-nav" aria-label="Main navigation">{links}</nav>
      <details className="mobile-pages">
        <summary>Pages</summary>
        <nav aria-label="Main navigation">{links}</nav>
      </details>
    </>
  );
}
