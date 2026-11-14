# Fire analytics dashboard

## Launch

From the repository root, install dependencies with `npm install`, then run these
commands in separate terminals:

```powershell
npm run server:dev
npm run client:dev
```

Open `http://localhost:5173/analytics/` for the dashboard or
`http://localhost:5173/` for the Explorer. Existing Vercel routes continue to work.
`vite preview` still requires an API-serving origin/proxy; use the development
commands above for the complete local workflow.

## Try every feature

1. **Choose data.** The current server endpoint remains the default. It returns an
   imported MODIS snapshot when configured, or labeled undated examples otherwise.
   Choose **Use simulated history** to explore the deterministic 2021–2025 fixture.
   Its banner remains visible on both pages. It is synthetic, not NASA data.
   **Return to loaded dataset** restores the previous server collection or upload.
2. **Draw an area.** Choose **Rectangle**, then click two opposite map corners.
   For **Polygon**, click corners and click the first corner again to close it.
   Completed selections update all analytics. **Edit area** enables drag/resize
   handles and polygon midpoints; **Done / cancel drawing** leaves drawing mode.
   **Clear area** restores all locations. The last valid area remains the active
   filter while a replacement is being drawn.
3. **Enter coordinates.** The default location is 35.759 latitude, −5.802 longitude,
   with a 25 km radius. Change these fields and select **Select location**.
   **Selected coordinates** exposes the GeoJSON ring in longitude/latitude order.
   **Zoom to area** frames it. Drawing/editing switches to the flat map; the saved
   selection also renders on the globe and survives basemap theme changes.
   Country search changes the camera, not the geographic filter.
4. **Filter and read statistics.** Set inclusive UTC start/end dates and select
   **Apply dates**. Choose MODIS, VIIRS, harmonized estimates when present, or the
   descriptive All Sources overview. Switch between hotspot detection count and
   mean FRP. The four KPIs report detection records, UTC observation days, mean
   available FRP in MW, and the peak day for the chosen metric, including ties.
   FRP distribution, maximum FRP, hourly timing, sources, and strongest records
   remain available below the new sections.
5. **Explore the calendar.** Switch between yearly and monthly views and select a
   year/month. Hover, focus, or tap a day for its date, metric/unit, hotspot count,
   sensor/method, and availability. Selecting a day focuses the map, KPI cards, and
   detail summaries. Clear it with **Clear selected day** or select the same day
   again. Historical charts retain the full selected range and highlight the
   focused period. Tab enters the calendar; arrow keys move between cells and
   Enter/Space selects one. Home/End jump to the displayed period boundaries.
6. **Compare history.** Monthly/yearly trend grouping changes the main chart.
   Toggle the baseline and individual comparison years; the newest two years in
   the selected range start enabled. Exact values are available on chart points
   and in expandable data tables. Choose an anomaly year for monthly results.
   With the simulated fixture, 2025 has eligible references in 2022–2024; the
   deliberately unavailable August days suppress that month's anomaly.
7. **Check uploads and navigation.** Upload a real FIRMS MODIS CSV, or use the
   deliberately **synthetic** three-row `client/tests/fixtures/analytics-smoke.csv`
   for a smoke test. With no area/day filter, it produces 3 detection records,
   2 active days, and mean FRP 40 MW. Navigate between Analytics and Explorer:
   the dataset and shared filters remain loaded. Refreshing restores server data.
   Failed uploads preserve the current dataset. Existing upload limits remain
   3 MiB and 50,000 detections, with no server-side persistence.
8. **Check Explorer tools.** Observation pagination, record inspection, FRP color
   scale, fixed-size points, country navigation, flat/globe projections, map
   themes, 24-hour/full-filtered-file scope, UTC/local-solar clocks, rolling
   playback, Next detection, and GeoJSON export remain available. Playback stays
   local to Explorer; Analytics uses UTC dates. A calendar selection pauses
   playback and opens the full chosen UTC day. Export includes provenance,
   shared filters, and the Explorer's clock/window metadata.

## Scientific interpretation

- Counts are satellite hotspot **detections**, never identified wildfire events,
  burned area, or fire perimeters. All Sources is an overview; historical
  comparisons require one sensor. Raw MODIS and VIIRS counts are not treated as
  equivalent, and a non-null normalized field does not convert a raw observation
  into a harmonized detection.
- Raw sensor FRP uses `raw_frp`; explicitly harmonized records use
  `normalized_frp`. Null, negative, and non-finite readings do not enter FRP means.
  Zero is a valid reading. Monthly/yearly FRP means weight individual readings;
  they do not average daily means or represent fire energy.
- Real CSVs contain detection records, not coverage manifests. Their first/last
  acquisition dates do **not** establish completeness. Days with no records and
  unknown coverage are hatched, not silently filled with zero. Known zero days
  require explicit complete coverage. Undated examples never acquire fake dates.
- A baseline uses the matching month/year in the immediately preceding three
  complete calendar years, under the same sensor, spatial filter, metric, and
  declared product/method. Reference years may lie outside the displayed date
  range but must exist in the loaded dataset. Contradictory per-record method IDs
  invalidate comparability. Coverage gaps, method changes, partial selected
  periods, or absent reference metrics suppress anomalies. CSV uploads therefore
  normally show a baseline-unavailable explanation.
- Absolute anomaly is observed minus the three-year mean. Percentage anomaly is
  that difference divided by the mean, multiplied by 100. A zero baseline permits
  an absolute difference but has no percentage result. Reference FRP means give
  each historical year equal weight.

## Architecture and changed files

The application remains React 19 + TypeScript + Vite, with MapLibre/react-map-gl
and deck.gl. It retains multiple HTML entrypoints for direct loading. Explorer
and Analytics share one React provider and use History API navigation; About
remains an ordinary page link. No routing, state-management, or chart package was
added. Only one page's map is mounted at a time.

| Subsystem | Files added or changed |
| --- | --- |
| Shared state/navigation | `DashboardProvider.tsx`, `dashboard-context.ts`, `dashboard-state.ts`, `DashboardApp.tsx`, `dashboard-navigation.ts`, `main.tsx`, `SiteHeader.tsx`, `client/analytics/index.html` |
| Data and calculations | `analytics-model.ts`, `analytics-engine.ts`, `fire-api.ts`, `historical-demo.ts`, `fire-data.ts`, `fire-analytics.ts` |
| Maps and selection | `FireMap.tsx`, `map-style.ts`, `area-selection.ts`, `App.tsx`, `FireObservations.tsx` |
| Analytics and controls | `AnalyticsPage.tsx`, `DashboardControls.tsx`, `ActivityCalendar.tsx`, `ActivityLineChart.tsx`, `HistoricalActivity.tsx`, `fire-dashboard.css` |
| Tests and fixtures | `analytics.test.mjs`, `area-selection.test.mjs`, `dashboard-state.test.mjs`, `analytics-fixtures.mjs`, `fixtures/analytics-smoke.csv` |
| Configuration/documentation | `client/package.json`, root `package-lock.json`, `README.md`, `FIRE_ANALYTICS.md` |

Source filenames above are relative to `client/src/`, and test filenames to
`client/tests/`, unless their directory is given explicitly. Existing observation
pagination and timeline tests are retained. No backend source or endpoint contract
changes are required.

New direct frontend dependencies:

- `terra-draw` **1.39.0** — rectangle/polygon drawing and editing.
- `terra-draw-maplibre-gl-adapter` **1.5.0** — connection to the existing MapLibre map.
- `@turf/boolean-point-in-polygon` **7.4.0** — boundary-inclusive geographic queries.

The root lockfile's pre-existing entries were preserved; additions introduce these
packages and their required transitive packages. Declared root development tools
were installed so the existing secret-scanning command can execute.

`fire-api.ts` wraps existing `GET /api/v1/fires` and `POST /api/v1/fires/upload`.
It validates collections and owns no visualization logic. Request revisions and
abort controllers prevent a stale server response from replacing a newer upload
or selected demo. Optional coverage metadata describes explicit global coverage
intervals by sensor, availability, and product/method; the existing backend is
not assumed to provide it. Future analytics requests can replace this adapter
without changing the shared filters or UI components.

The analytics engine caches prepared UTC timestamps, spatial/sensor queries, and
daily buckets. Geographic queries reject points outside the area's bounding box
before point-in-polygon testing. Calendar cells and charts use aggregated values;
observations remain GPU layers rather than thousands of DOM markers.

## Validation and limits

Node 24+ is required for the existing TypeScript-importing Node tests.

```powershell
npm --prefix client test
node --test server/modis-csv.test.js server/upload.test.js server/proxy.test.js
npm --prefix client run lint
npm run lint:secrets
npm run build
```

Tests cover concave/boundary geometry, invalid shapes and radius inputs, restoring
radius polygons into Terra Draw, UTC/leap-day boundaries, spatial/sensor/date
filtering, missing versus zero activity, FRP weighting, peak ties, baseline
eligibility, zero denominators, request races, dataset restoration, and navigation.

Selections support one simple polygon without holes, including rectangle or
64-segment geodesic radius polygons. Radius input supports >0 to 1,000 km; shapes
crossing the date line are explicitly rejected rather than silently wrapping the
filter across the globe. Date ranges are limited to 100 years. Multi-region and
date-line-crossing selection are future extensions.

Charts preserve missing periods as gaps. The API currently has no independently
verified real historical coverage or harmonization service; this work does not
create one. The labeled historical fixture demonstrates those capabilities.
Existing WebGL bundle-size warnings remain; no automatic commit, push, or
deployment is performed.

Validation completed on 14 November 2026: all 50 client/server tests passed;
client lint, secret scanning, whitespace checks, and the production build passed.
Browser checks covered desktop, tablet, and mobile widths; drawing/editing,
coordinate selection, theme/projection changes, calendar keyboard/day interaction,
historical controls, uploaded-data navigation/back/forward, refresh reset, local
playback, sensor availability, and exported GeoJSON. The synthetic CSV produced
the expected 3 records, 2 active days, and 40 MW mean FRP. A fresh final browser
session reported no runtime errors.
