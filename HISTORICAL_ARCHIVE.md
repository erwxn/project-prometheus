# Historical Fire Archive Explorer

This local feature queries the existing `server/data/vis-test.sqlite` observation
index. It does not change the source ZIPs or the ingestion/deduplication pipeline.
The index currently contains 6,525,167 records and 934 platform/month partitions:

| Platform | Indexed month bounds | Records |
| --- | --- | ---: |
| Terra / MODIS | 2000-11 to 2026-11 | 303,588 |
| Aqua / MODIS | 2002-07 to 2026-11 | 269,025 |
| Suomi NPP / VIIRS | 2012-01 to 2026-11 | 3,277,113 |
| NOAA-20 / VIIRS | 2018-04 to 2026-11 | 1,890,644 |
| NOAA-21 / VIIRS | 2023-03 to 2026-11 | 784,797 |

These bounds describe indexed records, not verified satellite coverage. The UI
uses actual catalog partitions rather than assuming every intervening month exists.

## Launch and cache lifecycle

Requires Node 24+ and Python 3 for ingestion. From the repository root:

```powershell
npm install
# Only if the original local index has not already been built:
npm run test-data:ingest -- test-data/vis-data
# Recommended before starting the API on a fresh checkout:
npm run archive:prepare
npm run server:dev
# Another terminal:
npm run client:dev
```

Open http://localhost:5173/analytics/. Without the local index, the archive picker
is hidden and archive query endpoints return an actionable 404; other data flows
remain available. Hosted archive storage is not part of this local implementation.

The first query or `archive:prepare` streams the existing index into disposable
`vis-test.sqlite.archive-v2.sqlite` beside it, with spatial RTree keys and daily
aggregate/detail caches. The cache is about 1 GB for this archive. A source-size /
mtime identity invalidates it after rebuilding the source index. The source is
queried without writing observations. SQLite transactions allow rebuilding an
interrupted cache on the next run. Run one API/cache-preparation process at a time.
First preparation took approximately 6 minutes 41 seconds on this machine;
subsequent starts reuse the sidecar. The UI remains in a loading state during
first preparation, so prewarming is recommended.

Stop the API before either cleanup command:

```powershell
npm run archive:clear-cache # only disposable spatial/aggregate cache
npm run test-data:clear    # source test index/report plus disposable cache
```

Neither command deletes original or repository ZIP inputs. Restart the API and
refresh the app after removal. Rebuilding remains possible from `test-data/vis-data`.

## Walkthrough

1. Choose Satellite, Year, and Month. Year defaults to the newest available for
   the platform; Month defaults to All available months. Optional dates are
   inclusive UTC dates. Apply submits the draft; editing controls alone does not
   query. Reset restores the default platform/latest year and clears area/day.
2. The summary distinguishes all indexed matches from loaded/displayed map points
   and the map's viewport/day total. Recorded bounds are not coverage guarantees.
   At most 10,000 points load per map page; Previous/Next never change analytics.
3. Use the existing rectangle, polygon, radius, edit, clear, and zoom controls.
   Numeric bounding-box entry writes the same validated GeoJSON selection. Area
   changes refresh all aggregates; camera movement refreshes only map points.
4. The calendar contains full-selection daily totals, not the point page. Its
   year menu now includes all catalog years for the platform. Changing it applies
   the entire chosen year. Focus, arrow keys, and Enter work as before. Choosing
   a day focuses KPIs/details/map, pauses Explorer playback, and highlights history.
5. Choose detection count or mean measured FRP. KPIs and existing hourly/source/
   FRP-band/strongest-observation details use the full selected scope. The hourly
   detail offers UTC and local mean solar grouping; playback remains local and
   explicitly describes loaded map observations.
6. Monthly/yearly trends retain the applied range. Comparison year toggles default
   to the selected year and the two preceding available years. Same-platform,
   same-known-version series offer monthly and daily year-over-year views. Daily
   curves align by month/day, preserving gaps on non-leap February 29. Mixed or
   unknown versions suppress comparisons with an explanation. All satellites is
   an overview, with comparisons disabled.
7. Baselines and anomalies are unavailable for this archive because complete
   coverage is unverified. Missing days are gaps, never zero observations asserted
   as fire-free days. Mean FRP is total valid FRP divided by reading count; missing
   FRP is excluded and zero readings are retained. No harmonized values are created.
8. Export aggregate results downloads full-selection JSON, filters, and coverage
   warnings. Explorer Export data downloads only loaded/playback-visible points,
   with applied archive filters and explicit export scope. Uploading a CSV or
   choosing simulated history switches data mode. Navigation preserves state;
   returning from simulation restores the last successfully loaded dataset.

## API and indexes

Existing GET `/api/v1/fires/test` and `/test/catalog` remain compatible. Catalog
adds platform names, available years, and observed bounds; partitions already
include month and count. The new POST routes are:

- `/api/v1/fires/archive/summary`: full matching daily/monthly/yearly aggregates,
  FRP count/sum/maximum, hourly UTC/solar counts, sources, bands, top readings,
  peak days/ties, observed bounds, and unknown-coverage/baseline explanations.
- `/api/v1/fires/archive/comparison`: the same aggregation for up to ten supplied
  years of one platform, within the same geographic area. Full comparison years
  intentionally extend beyond the main display range.
- `/api/v1/fires/archive/observations`: GeoJSON points with `total`, `nextCursor`,
  and explicit loaded-observation scope; maximum 10,000 points per request.

Common body: `{platform, startDate, endDate, area?}`. Platform is a catalog ID or
`ALL`; `area` is one closed, valid, noncrossing Polygon Feature without holes.
Comparison adds integer `years`; observations optionally adds `viewport` as
`[west,south,east,north]`, `selectedDay`, and integer `cursor` (default 0).
Invalid parameters return JSON 400, absent index returns 404. UTC end dates use
an exclusive next-day boundary. No user values are interpolated into SQL.

Temporal queries reuse `by_partition(platform,date,time)` and the cached daily
primary key. For geographic boxes below 1,200 square degrees, queries use RTree bounds and
indexed key lookup; larger areas use the platform/date index with coordinate
prefiltering to avoid scanning spatial candidates from every archived year. Both
paths then apply exact,
boundary-inclusive Turf point-in-polygon filtering. The bounding box is never
substituted for a concave polygon. Aggregate loops stream rows and retain bounded
per-day statistics/top-eight readings. A dedicated worker keeps Express responsive.
Identical in-flight queries share work; subscriber cancellation aborts work only
when no subscribers remain. A 24-entry / 32 MB LRU caches normalized aggregate
queries per source identity; individual cache entries above 16 MB are not stored.
Map requests are debounced 250 ms, cancellable, revision-guarded, and paginated.

Measured on the real archive: SNPP 2024 summary returned 200,770 records (verified
against direct SQL) in about 0.6 seconds after preparation. The region
[-10,30,0,36] returned 5,904 records in about 1.6 seconds after index/query-plan
improvements; cached repetitions took about 10 ms. A global yearly point page
returned 10,000 of 200,770 in about 3.3 seconds. `/health` returned HTTP 200 in
66 ms while an archive query was running. Times vary with disk cache and scope.
Query plans confirm daily primary-key searches and RTree candidate filtering;
large regions or all-platform ranges can still require substantial worker time.

## Implementation and validation

Backend additions: archive validation, worker, request service, cache CLI, and
regression tests; route/catalog/cleanup integration in the existing server.
Frontend additions: typed archive model, shared archive query hook, archive history
views; integration in provider/reducer, archive toolbar, calendar, maps, analytics,
existing SVG chart tooltips/tables, export, and responsive styles.

The backend declares the existing Terra Draw 1.39.0 and Turf point-in-polygon
7.4.0 dependencies explicitly; no new library family is introduced.

Run:

```powershell
node --test client/tests/*.test.mjs server/*.test.js
npm --prefix client run lint
npm run build
npm run lint:secrets
git diff --check
```

Tests cover full-scope totals above 50,000 points, independent pagination, concave
and boundary inclusion, invalid geometry/parameters, UTC/leap days, missing FRP,
zero FRP, weighted means, unknown coverage/baselines, mixed versions, cancellation,
shared-work cancellation, archive restoration, and upload/map state isolation.
Existing timeline, analytics, upload, feed, and navigation tests remain applicable.
Browser checks include year switching, map paging, day focus, navigation, bounds,
themes/globe transitions, CSV switching, and the mobile toolbar.
