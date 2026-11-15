# Historical delivery contract (model-independent foundation)

## Available sources

`archive` queries the local raw NASA FIRMS SQLite test index. `snapshot` queries the configured harmonized API/GCS snapshot, or the currently configured default dataset when no remote source is configured. No production cloud database is provisioned here. Snapshot queries cover only the records in that published snapshot, not every object in a GCP bucket.

`POST /api/v1/history/query` accepts:

```json
{
  "source": "snapshot",
  "startDate": "2026-01-01",
  "endDate": "2026-12-31",
  "sensor": "Harmonized",
  "country": "FRA",
  "area": null,
  "cursor": 0
}
```

For `archive`, supply `platform` (`Terra`, `Aqua`, `SNPP`, `N20`, `N21` or `ALL`); sensor filtering is represented by that platform. Dates are inclusive UTC dates. Optional `area` is the existing validated polygon contract; it intersects the country. Optional `selectedDay` restricts the search to that date inside the date range. Observation pages contain at most 10,000 records. Pass the returned `nextCursor` until null. Aggregates always cover the entire matching selection, independently of the page. Each response identifies source, version, coverage, metric definition, and scope.

Use the returned `metadata.version` as `expectedVersion` on subsequent requests to avoid mixing publications. A changed version returns HTTP 409; rerun the search. Cursor is an offset scoped to the same dataset version and filters.

`POST /api/v1/history/export.csv` accepts the same filters plus `expectedVersion`. It always starts at record zero and walks all matching pages, even if a cursor was supplied. The result has a CSV content disposition and `X-Dataset-Version` / `X-Export-Rows` headers. CSV columns contain UTC acquisition time, coordinates, raw/estimated FRP separately, sensor/platform, product/model version, source and dataset version. Zero is preserved and null is empty. Text formulas are neutralized for spreadsheet safety.

The default maximum CSV export is 250,000 records. Larger queries return HTTP 413 with instructions to narrow the search; no records are silently omitted. Browser export requests time out after two minutes and display a recovery message. Interrupted exports are failed downloads, not successful partial selections. The route streams rows with backpressure; the browser saves the complete response as a file.

## Analyze interface

- Search downloads export every matching raw archive record, independent of map paging.
- Uploaded/simulated/loaded snapshot exports use all matching locally loaded rows; the UI explicitly states this scope. The browser does not upload a private CSV to the historical service.
- Dataset status separates whole-selection counts from the loaded map page, identifies publication/index versions, and reports unknown coverage.
- The year-by-month heatmap uses one linear scale across the chosen period. Missing months stay unknown, known zeros stay zero, partial periods are marked, and FRP means use valid readings including zero.

## Publication and model requirements

The existing feed adapter accepts complete replacement snapshots, validates a publication before exposing it, retains the last valid publication on invalid updates, and recovers on the next valid publication. It does not merge incremental batches. Use a completed versioned publication; do not expose half-written files. API adapters for external historical stores can implement this query contract later.

The current descriptive metrics are record count and mean FRP. The web service does **not** assert that correcting FRP harmonizes hotspot counts. Before adding a validated activity metric, the data team must define the meaning of an output row, counting/weighting rules, coverage, units and comparability. The scientific anomaly gates remain unchanged.

Requested teammate sample fields: stable record ID, longitude, latitude, UTC acquisition timestamp, harmonized value(s) with units, model/product version, dataset/publication version, publication time, and coverage/missing-data semantics. Keep original measurements distinct from estimates.

Integration tests exercise actual HTTP routes, multi-page exports, region/date filters, explicit zeros, version changes, cold failures, retained stale publications, recovery, and valid empty replacements. They use synthetic fixtures and a mocked upstream publication; real GCP credentials and end-to-end production access still require verification when supplied.
