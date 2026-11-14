# Three experience workstreams

No accounts or role permissions: everyone can switch freely in the header.

| Workstream | Route | Primary files | Responsibility |
| --- | --- | --- | --- |
| Explore | `/` | `client/src/App.tsx` | Approachable map, location search, observation details and expandable dataset/advanced controls. |
| Analyze | `/analytics/` | `client/src/AnalyticsPage.tsx`, `ActivityCalendar.tsx`, `HistoricalActivity.tsx`, `ArchiveHistory.tsx` | Historical queries, scientific comparisons, calendar and exports. |
| Monitor | `/monitor/` | `client/src/MonitorPage.tsx`, `useMonitorFeed.ts`, `monitor-model.ts` | Rolling 24-hour UTC window, polling, freshness and frozen playback. |

All work goes on `rayane` as requested. Coordinate edits to shared files before pushing; pull colleagues' changes first. These are module boundaries, not separate branches.

## Shared boundaries

- `DashboardProvider.tsx` owns research data and geographic selection; its provider stays mounted while switching views. Area selection is shared. Monitor ignores historical date and sensor filters and does not replace research datasets.
- `FireMap.tsx` owns map rendering and drawing. Monitor opts out of archive viewport queries through `trackArchive={false}`.
- `SiteHeader.tsx` and `dashboard-navigation.ts` own view navigation. `editorial.css` and `fire-dashboard.css` define shared styling.
- Monitor currently polls the existing `/api/v1/fires` endpoint every 60 seconds, without overlapping requests, and retains its last successful snapshot on errors. This is an integration scaffold, not a connected operational live feed. Backend integration can replace the endpoint in `useMonitorFeed.ts` without changing the map or playback math.
- The future live endpoint should return a dated GeoJSON FeatureCollection with all observations for the last 24 hours, including UTC timestamps. Mark `metadata.live: true` only when this is a real live source. Implement pagination in the adapter if the eventual API requires it; the current adapter expects a complete response.
- Monitor anchors to wall-clock time, not the latest historical record. Historical/demo observations stay excluded when outside the last 24 hours. Successful refresh time and newest observation time are displayed separately.
- Live follows now; playback freezes the 24-hour window and displays its preceding hour at the chosen cursor. Return to live resumes the advancing window. No alerts, routing, evacuation guidance, or emergency dispatch is implemented.

## Checks before sharing

Run `npm --prefix client test`, `npm --prefix client run lint`, and `npm run build`. Check direct navigation to each route and mobile navigation. For Monitor, verify empty historical input, both window boundaries, future/undated exclusions, playback, network failure and recovery.
