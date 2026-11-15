# 🔥 Project Prometheus: MODIS & VIIRS Hot Spot Harmonization

The current dashboard and API use the Morocco-only study area. See [Morocco data setup](docs/morocco-data.md) for verified FIRMS exports, the frozen-model pilot and source-boundary provenance. Generated datasets and the separate Python ingestion pipeline are not part of this dashboard update.


![NASA Space Apps Challenge Tangier 2026](https://img.shields.io/badge/NASA_Space_Apps-Tangier_2026-0B3D91?style=for-the-badge&logo=nasa)
![React](https://img.shields.io/badge/Frontend-React_&_deck.gl-61DAFB?style=flat-square&logo=react)
![Node.js](https://img.shields.io/badge/Backend-Express.js-339933?style=flat-square&logo=node.js)
![AI/ML](https://img.shields.io/badge/AI-Python_&_Random_Forest-3776AB?style=flat-square&logo=python)

## 🌍 The Challenge
Humanity has a critical 20+ year record of global wildfires, but it is split across two generations of satellite sensors:
* **MODIS (Terra/Aqua):** 1km spatial resolution, capturing data around 10:30 AM and 1:30 PM.
* **VIIRS (Suomi NPP/NOAA-20/21):** 375m spatial resolution, heavily concentrated around 1:30 PM.

Due to the spatial resolution mismatch and the 3-hour diurnal fire cycle gap (fires burn vastly differently in the morning vs. afternoon), these datasets cannot be directly compared. If merged naively, the data creates a false "spike" in global fires post-2012 and obscures the true intensity of early-morning thermal anomalies.

## 🚀 Our Solution
Project Prometheus bridges this scientific divide through a robust AI and Big Data pipeline, visualized on a high-performance 3D WebGL geospatial dashboard.

1. **Temporal Normalization:** We convert raw UTC acquisition times into Local Solar Time (LST). Using historical weather data (ERA5), our model applies a dynamic temporal curve to predict and scale morning MODIS detections to their peak afternoon VIIRS equivalents.
2. **Spatial Harmonization:** We translate 1km MODIS Fire Radiative Power (FRP) into a normalized baseline aligning with the 375m VIIRS grid.
3. **High-Performance 3D Visualization:** Our Node.js Express API serves harmonized GeoJSON to a WebGL-powered React frontend (`deck.gl` + `MapLibre GL`), allowing users to smoothly scrub through the diurnal fire cycle in real time.

---

## 🛠️ Monorepo Architecture & Tech Stack

```text
web-service-Nasa-Space-Apps/
├── .husky/                  # Git pre-commit hooks (Husky v9 + lint-staged)
├── .secretlintrc.json       # Secretlint configuration (strict UTF-8)
├── package.json             # Root workspace scripts & devDependencies
├── vercel.json              # Vercel monorepo deployment manifest
├── server/                  # Node.js + Express REST API
│   ├── index.js             # API server with rate limiting & security headers
│   └── package.json
└── client/                  # React + Vite + TypeScript Geospatial Frontend
    ├── src/
    │   ├── App.tsx          # deck.gl + MapLibre GL 3D Map Component
    │   ├── main.tsx         # Entrypoint
    │   └── index.css        # Full-viewport layout reset (100vw/100vh)
    └── package.json
```

* **Frontend**: React 19, Vite, TypeScript, `deck.gl` (@deck.gl/react, @deck.gl/layers, @deck.gl/aggregation-layers), `react-map-gl`, `maplibre-gl`.
* **Backend**: Node.js, Express.js, `cors`, `helmet`, `express-rate-limit`.
* **SecDevOps**: Husky v9, `lint-staged`, `@secretlint/secretlint-rule-preset-recommend`.

---

## 📡 API Endpoints (`server/index.js`)

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Service health status (`{ status: "ok", service: "MODIS-VIIRS Harmonizer API" }`) |
| `GET` | `/api/v1/fires/sample` | Returns GeoJSON `FeatureCollection` with mock harmonized fire anomalies |
| `GET` | `/api/v1/fires/diurnal?hour=HH` | Spatial fire anomalies filtered by Local Solar Time (`00` through `23`) |

---

## 💻 Local Development Setup

### Prerequisites
* Node.js (v18+)
* npm (v9+)

### Installation & Run

1. **Clone the repository**
   ```bash
   git clone https://github.com/erwxn/Web-service-Nasa-Space-Apps.git
   cd Web-service-Nasa-Space-Apps
   ```

2. **Run Backend Server (Port 5000)**
   ```bash
   npm run server:dev
   # or
   npm run start
   ```

3. **Run Frontend Client (Vite Dev Server)**
   ```bash
   npm run client:dev
   ```
   Open `http://localhost:5173` in your browser.

4. **Run Secretlint & SecDevOps Validation**
   ```bash
   npm run lint:secrets
   ```

5. **Production Build**
   ```bash
   npm run build
   ```

---

## 🌐 Deployment (Vercel)
The root `vercel.json` automatically routes client requests to the static build (`client/dist`) and API requests to `server/index.js` via `@vercel/node`.

## Import a NASA FIRMS MODIS CSV

Place a FIRMS MODIS CSV at `server/data/modis.csv`, then restart `npm run server:start`.
Alternatively set `FIRES_CSV_PATH` to an absolute CSV path before starting the backend.
Local data files are ignored by Git. A temporary browser upload flow is available for testing (see below).

`GET /api/v1/fires` returns the imported GeoJSON and provenance metadata; without a file it returns explicitly labeled demo data. `GET /api/v1/fires/sample` remains a demo-only endpoint. The diurnal endpoint filters the active dataset by local solar hour.

Required CSV columns: `latitude, longitude, acq_date, acq_time, satellite, confidence, frp`.
The importer accepts Terra (`T`/`Terra`) and Aqua (`A`/`Aqua`), validates coordinates,
UTC dates/times, confidence (0–100) and nonnegative FRP (MW). Invalid rows are counted
in metadata; invalid headers or a file with no valid rows fail startup.

Acquisition times are zero-padded HHMM in UTC. The original UTC timestamp is preserved.
`local_solar_time` and `local_solar_date` use **local mean solar time**:
UTC + longitude / 15 hours, including date rollover. This does not include the equation
of time and must not be described as apparent solar time. `normalized_frp` stays null
because raw detections contain no harmonized model predictions.

The client shows actual acquisition dates, supports dated UTC and local-solar windows, and renders
raw detections by measured FRP. Its observation list is capped at the 100 strongest
matching detections; all matching detections remain available to the map and GeoJSON export.
VIIRS and harmonized selections correctly have no data in a MODIS-only import.

Importer checks: `node --test server/modis-csv.test.js`.

### UTC timeline and local solar analysis

The explorer defaults to **UTC**, using `observed_at_utc` directly. A dated 24-hour
window ends one minute after the latest observation in the file (exclusive end).
This includes the latest observation without mixing the whole multi-day CSV into
a single daily cycle. Change the labeled window-start field to inspect another period.

- Full-window mode shows only detections within the selected 24 hours.
- Playback advances every 1.1 seconds, in 15-minute observation-time steps.
- Rolling mode shows the preceding 60 minutes, clipped to the selected window.
- Next detection skips empty intervals for the selected dataset and wraps within
  the same 24-hour window; it is disabled when no matching detection exists there.
- Local solar analysis aligns each observation's local mean solar date and clock;
  these are not simultaneous global instants. UTC satellite-pass annotations are
  intentionally absent because the old annotations described local solar hours.
- Undated demo data is labeled explicitly and has no real acquisition date.

Timeline boundary checks: `node --test client/tests/timeline.test.mjs` (Node 24+).


### Temporary browser CSV uploads

In the left panel, open **Test a MODIS CSV**, click **Upload CSV**, and choose a
NASA FIRMS MODIS CSV. The API validates it and returns GeoJSON for that browser's
current map. It never writes the upload to disk or replaces the shared server dataset.
Refreshing or clicking **Restore server dataset** returns to the server's default data.
A valid upload resets filters to UTC, scatter mode and the latest dated 24-hour window.
Failed uploads preserve the currently loaded map.

Testing limits: 3 MiB UTF-8 CSV, up to 50,000 valid detections. Invalid rows are reported;
invalid headers, malformed CSV, empty files and entirely invalid observations produce errors.
VIIRS and custom ML output schemas are not supported by this MODIS importer yet.

`POST /api/v1/fires/upload` accepts raw `text/csv` with an optional URL-encoded
`X-CSV-Filename` header. Responses are gzip-compressed when accepted by the browser.
There is no dataset persistence or cross-user publication.

To remove testing access later, set `ENABLE_CSV_UPLOAD=false` on the server and
`VITE_ENABLE_CSV_UPLOAD=false` when building the frontend, then restart/rebuild.
The route and the UI are explicitly separated for straightforward deletion.

Upload API checks: `node --test server/upload.test.js`.


### Entire-file exploration

Choose **Entire file** in the timeline to show all detections from the earliest to the
latest record in the loaded file, rather than only the selected 24 hours. Sensor filters
still apply. Playback, rolling previous-hour mode, and Next detection operate across
that complete range, including dates beyond the first day. Date labels on the timeline
identify multi-day boundaries. The final observation is included, even when the file's
length is not a multiple of the 15-minute playback step. **Selected 24 hours** returns
to the editable daily window. These modes work for uploaded and server-loaded CSVs.


### Basemap and interaction performance

The explorer now uses OpenFreeMap vector basemaps: Positron for light mode and Dark
for dark mode. The woodland fill is omitted so incomplete land-cover coverage does
not produce green rectangular patches behind the fire observations. Roads, rivers,
boundaries and labels remain. Attribution stays visible on the map.

MapLibre's worker is bundled by Vite and configured on the exact MapLibre module
passed to react-map-gl (`client/src/maplibre.ts`). Both rendering canvases cap their
pixel ratio at 1.5 to limit high-DPI GPU load. Columns use eight sides and unlit
materials; scatter remains the default for imported files.

Timestamps, daily bounds and FRP rankings are cached per dataset/time basis. Next
detection uses a linear scan instead of sorting every frame; the 100-row detail
list reuses the cached ranking. On the 21,518-row example, a local 100-iteration
comparison measured about 9.8 ms versus 0.37 ms for timestamp preparation plus next
lookup, with identical results. This is a CPU lookup measurement, not map FPS or
network tile-loading time. Initial tile loading still depends on the provider/network.

Provider setup: https://openfreemap.org/quick_start/
Layer optimization guidance: https://deck.gl/docs/developer-guide/performance


## Step 8: Vercel monorepo deployment and API selection

Use the repository root (`.`) as the Vercel project's Root Directory. Keep the root
`vercel.json`: it builds `client/package.json` with `@vercel/static-build` into `dist`,
and exports `server/index.js` through `@vercel/node`. API and health routes precede
static routing. The existing filesystem and `/about` routes preserve the data guide;
the final catch-all maps to `client/$1`.

The root workspace lockfile now includes both client and server dependencies for
reproducible installation (`npm ci` from the repository root). The Express app is
exported with `module.exports`; its standalone listener runs only when started directly.

Both observation fetching and CSV testing uploads use:

```typescript
const API_BASE = import.meta.env.PROD ? '' : 'http://localhost:5000';
```

- Local development: run `npm run server:start` and `npm run client:dev` in separate
  terminals. The browser calls Express on port 5000; the server's existing CORS
  middleware supports the separate Vite origin, including the upload filename header.
- Production: `npm run build` replaces the development API base with an empty string.
  Calls use the deployed site's `/api/v1/fires` and `/api/v1/fires/upload` endpoints.
  No localhost API URL is included in the production JavaScript.
- `vite preview` serves a production build; it needs an API-serving origin/proxy to
  exercise API calls. Use the normal development commands for the localhost workflow.

Local `server/data/modis.csv` is Git-ignored and is not deployed automatically. With
no configured CSV on the deployment, the API returns the labeled demo dataset. The
browser upload tool can load a test CSV into the current browser's map without
server persistence. Set `ENABLE_CSV_UPLOAD=false` and build with
`VITE_ENABLE_CSV_UPLOAD=false` when disabling that temporary tool.

Post-deployment smoke checks: open `/`, `/about`, `/health`, and `/api/v1/fires`, then
upload a small valid MODIS CSV. This configuration task does not itself publish a
Vercel deployment or change the account's project settings.

## Fire analytics dashboard

The connected Explorer and `/analytics/` workspace now includes shared GeoJSON area
selection, UTC date/sensor/metric filters, a daily burning calendar, fire statistics,
and historical comparisons. Temporary CSV uploads remain available when navigating
between these two pages; refreshing loads the server dataset again.

See [FIRE_ANALYTICS.md](FIRE_ANALYTICS.md) for the architecture, scientific rules,
dependencies, launch commands, feature walkthrough, limitations, and validation.

## Production harmonized results

The service supports configurable API or private Google Cloud Storage snapshots in CSV, Parquet, or tabular JSON. See [the integration and teammate handoff guide](docs/harmonized-feed.md) for environment settings, column mapping, credentials, local fixtures, validation commands, and cache limitations. The MODIS upload remains a separate temporary testing tool.

## Historical archive explorer

The local NASA FIRMS archive supports platform/year/month/date/area filters,
full-selection calendar and statistics, and separately paginated map points.
See [HISTORICAL_ARCHIVE.md](HISTORICAL_ARCHIVE.md) for launch/cache commands,
API contracts, scientific limits, and the walkthrough. Original ZIP inputs stay
unchanged; generated indexes and caches remain Git-ignored.

## Experience workstreams

Explore, Analyze and Monitor share navigation without accounts. See [the team workstream guide](docs/experiences.md) for routes, file ownership boundaries and the live-feed integration contract.
