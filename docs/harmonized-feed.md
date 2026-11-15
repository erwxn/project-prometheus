# Harmonized data integration

The web service can pull complete published snapshots from a teammate API or Google Cloud Storage. It accepts the team delivery ZIP, native cell/group CSV or Parquet tables, and the earlier flat CSV/Parquet/JSON contract. See [the delivery contract](harmonized-delivery.md) for exact counting rules and a runnable preview. This connection is separate from the temporary MODIS testing uploader. No cloud resources or credentials are created by the application.

## Configuration

Set environment variables on the Express process or hosting platform. Express does not automatically load `.env` files.

| Variable | Purpose / default |
| --- | --- |
| `HARMONIZED_SOURCE` | `https://team.example/results.csv` or `gs://bucket/published/results.parquet`. Unset preserves existing local MODIS/demo behavior. Local HTTP is allowed only for loopback addresses. |
| `HARMONIZED_FORMAT` | `csv`, `parquet`, `json`, or `zip`; otherwise inferred from the source filename. Set explicitly for API paths without an extension or signed download URLs. |
| `HARMONIZED_SOURCE_NAME` | Public dataset label; default `Team harmonized results`. Use an honest label for fixtures. |
| `HARMONIZED_API_TOKEN` | Optional bearer token for an HTTPS API. Server-side only. |
| `HARMONIZED_COLUMNS` | JSON mapping from canonical names below to the team's column names. |
| `HARMONIZED_JSON_PATH` | Dot-separated path to the record array, such as `data.results`; default expects a top-level array. |
| `HARMONIZED_REFRESH_SECONDS` | Minimum interval between upstream requests in one server process; default 60. |
| `HARMONIZED_TIMEOUT_SECONDS` | Download/authentication timeout; default 15. |
| `HARMONIZED_MAX_BYTES` | Maximum downloaded bytes; default 33554432 (32 MiB). |
| `HARMONIZED_MAX_ROWS` | Maximum records per complete snapshot; default 100000. |

For GCS, use Google Application Default Credentials with read access to the published object. On GCP, attach an appropriate service account to the runtime. For local development, `gcloud auth application-default login` is an option. Outside GCP, configure supported workload identity federation or a server-only `GOOGLE_APPLICATION_CREDENTIALS` file. Never put credentials in `VITE_*`, source files, or Git. A Vercel deployment does not acquire GCP access automatically.

The backend reads GCS through Google's authenticated Storage JSON API using ADC. It does not make the bucket public, upload files, or grant permissions. HTTPS connections can return tabular JSON, CSV, or Parquet directly. Redirects are rejected; configure the final URL. API pagination, arbitrary archives, incremental batches, and APIs that only return download links require a further adapter.

## Record contract

Column headers are trimmed and case-insensitive. Defaults allow common aliases; override them if the team chooses other names.

| Canonical field | Default aliases | Requirement |
| --- | --- | --- |
| `latitude` | `lat` | Finite number, -90 through 90. |
| `longitude` | `lon`, `lng` | Finite number, -180 through 180. |
| `observed_at_utc` | `timestamp`, `timestamp_utc` | ISO UTC string ending in `Z`, including seconds; Parquet logical timestamps may decode to Date objects. Represents the instant estimated by the result, not its processing time. |
| `harmonized_frp_mw` | `harmonized_frp`, `normalized_frp` | Finite nonnegative estimate in MW; zero is valid. Do not supply another unit under these names. |
| `id` | `observation_id` | Optional unique identifier. Without it, time and coordinates form the identifier; duplicate time/coordinate results then reject the snapshot. |
| `model_version` | — | Optional method/model version, retained when supplied. |

Example CSV (illustrative data only):

```csv
id,latitude,longitude,observed_at_utc,harmonized_frp_mw,model_version
illustrative-1,35.7,-5.8,2026-11-14T13:30:00Z,185.2,illustrative-only
```

For different names:

```powershell
$env:HARMONIZED_COLUMNS = '{"latitude":"y","longitude":"x","observed_at_utc":"time","harmonized_frp_mw":"prediction"}'
```

An upstream JSON API may return an array of these records or an envelope selected by `HARMONIZED_JSON_PATH`. This is not a GeoJSON input contract. Parquet uses the same columns and supports Snappy and additional codecs through hyparquet-compressors. Confirm the team's actual Parquet schema and codec with a representative file before launch. Flat latitude/longitude columns are required; nested geometry-only GeoParquet needs mapping code.

Invalid coordinates, dates, FRP, duplicate identifiers, schema errors, and limit violations reject the **whole snapshot**. The adapter never invents raw sensor measurements, confidence, or a model version. It labels all accepted records `Harmonized`, stores the estimate in `normalized_frp`, leaves `raw_frp` null, and derives local mean solar clocks from the original UTC instant. For the generic contract, other input columns are ignored. Native delivery tables preserve the model and cell fields described in the delivery contract. Empty CSVs with valid headers, empty Parquet tables with valid schema, and empty JSON arrays represent zero observations.

## Publishing and refresh behavior

Assumption: each delivery is a complete replacement snapshot. The data team owns storage and historical retention. Publish one complete object at the agreed path after their processing finishes. The application does not append batches or collect files from a folder. A single-object publication must represent a consistent complete dataset.

`GET /api/v1/fires` and `/api/v1/fires/diurnal` resolve the configured feed. Concurrent requests share a refresh within one process. Upstream ETag/Last-Modified validators avoid unchanged downloads when supported. A content hash identifies each accepted snapshot. The explorer and analytics poll once per minute; the explorer keeps its source/time controls, and a temporary testing upload prevents shared updates from replacing it. Delivery latency is approximate and can include both the backend cache interval and the browser polling interval.

After a valid snapshot has loaded, upstream errors or invalid updates keep the previous snapshot with `metadata.feed_status: stale`. A configured source with no valid snapshot returns HTTP 503 instead of API demo data. The browser's initial offline fallback is explicitly labelled as a demo. `/health` remains process liveness, not upstream readiness. `/api/v1/fires/sample` always remains illustrative data.

**Cache durability:** the last valid snapshot is held in memory per server instance. Cold starts, restarts, and separate Vercel instances do not share it. If the upstream fails during a cold start, requests return 503. GCS remains the durable source; durable last-good caching across instances would need shared storage and is not implemented here. No deployment or real-source validation occurs just by setting up this code.

## Try it before the team's source exists

Terminal 1, repository root:

```powershell
node server/mock-harmonized-feed.js
```

Terminal 2, repository root:

```powershell
$env:HARMONIZED_SOURCE = 'http://127.0.0.1:5051/results.csv'
$env:HARMONIZED_SOURCE_NAME = 'Illustrative local integration fixture'
npm run server:start
```

Use the normal client dev command in a third terminal. Edit `server/fixtures/harmonized.csv` to try a replacement snapshot; the mock rereads it for each request. This file is synthetic and must not be presented as a genuine model result. Stop the mock and unset `HARMONIZED_SOURCE` to return to ordinary local behavior.

Check a teammate file locally without publishing it:

```powershell
node server/check-harmonized.js path/to/results.csv
node server/check-harmonized.js path/to/results.parquet
node --test client/tests/*.test.mjs server/*.test.js
```

## Handoff checklist

Obtain the final endpoint/object path, authentication method, actual column names, and an example snapshot. Confirm UTC meaning, FRP units, complete-snapshot semantics, expected volume, and delivery frequency. Configure the environment and access, validate their example, then deploy and verify the real source. A custom authentication protocol, epoch-number timestamps, or incremental delivery requires additional integration work.

References: [Google Cloud Storage downloads](https://docs.cloud.google.com/storage/docs/downloading-objects), [ADC](https://docs.cloud.google.com/docs/authentication/application-default-credentials), [hyparquet](https://github.com/hyparam/hyparquet).
