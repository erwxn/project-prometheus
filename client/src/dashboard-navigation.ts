export function dashboardPage(pathname: string): 'explorer' | 'analytics' | 'monitor' {
  if (/^\/monitor\/?$/.test(pathname)) return 'monitor';
  return /^\/analytics\/?$/.test(pathname) ? 'analytics' : 'explorer';
}
export function navigateDashboard(event: { button: number; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; preventDefault(): void }, href: string) {
  if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || !['/', '/analytics/', '/monitor/'].includes(href)) return;
  event.preventDefault();
  if (window.location.pathname !== href) { window.history.pushState({}, '', href); window.dispatchEvent(new PopStateEvent('popstate')); }
}
