# Team harmonized delivery integration

Explore and Analyze now accept the supplied `delivery_2014_morocco.zip` format through the same server-side connector used for cloud publications. The real example is preserved at `test-data/harmonized/delivery_2014_morocco.zip` for regression testing. It is historical model output, not a live feed. No cloud credentials are included.

## Preview now

Stop the ordinary Express dev server if it occupies port 5000. From the repository root, run these in separate terminals:

```powershell
npm run harmonized:preview
```

```powershell
npm run client:dev
```

Open the client URL printed by Vite. Both Explore and Analyze use this sample. The preview banner distinguishes it from cloud data. A different delivery can be passed to `npm run harmonized:preview -- C:/path/to/delivery.zip`. Restart the ordinary server to return to its previous source.

Validate without starting the website:

```powershell
npm run harmonized:check -- test-data/harmonized/delivery_2014_morocco.zip
```

For the example, expect **444 candidate cells, 59 fire groups and 117 selected predicted cells**. No December partition is present. Missing records are not treated as known zeros, even though the producer README says 365 days were processed: this alone does not certify complete spatial and temporal coverage.

## Object to publish from Airflow

Publish a **complete replacement ZIP** at a stable GCS object path after processing finishes. This avoids reading a folder partway through an Airflow run. The ZIP may contain multiple years. Its contents may be nested beneath a delivery directory.

- `cells_frp_YYYY.parquet` is preferred for each year.
- If that year's flat file is absent, `cells/year=YYYY/month=MM/*.parquet` partitions are combined.
- Flat and partitioned copies are never added together for the same year.
- `accuracy_YYYY.json` is retained as producer validation metadata, not used as satellite observations or as a model input.
- `fires_YYYY.parquet` and `daily_summary_YYYY.csv` inside the ZIP are not added to cell counts: they summarize the same data. The calendar and filtered summaries are computed from selected cells so region/date filters remain consistent.
- Alternatively, publish a native cell CSV/Parquet file directly. Publishing `fires_YYYY.parquet` directly switches the whole publication to fire-group records. **Do not mix group and cell counting units in one publication.** A daily summary alone cannot populate a map.

Only declared cell tables are decoded. Paths are never extracted. Archives are bounded to 4,096 entries and 32 MiB total uncompressed data by default, including ignored entries. The normal 100,000-row limit applies to all candidate cells before threshold selection, across all selected partitions. Oversized or malformed publications are rejected as a whole. Increase limits only after measuring server memory and response size; larger histories will need a query service rather than an unlimited browser snapshot.

## Interpretation and retained fields

Cell input uses `cell_lon`, `cell_lat`, `time_utc`, `fire_id`, `cell_column`, `cell_row`, `p_viirs`, `p_uncertainty`, `detect_f1`, `cell_area_km2`, `frp_cell_mw`, and `frp_group_viirs_eq_mw`. CSV accepts numeric text and case-insensitive `true`/`false` flags. Parquet's typed timestamps, booleans and integers are supported. Optional region, source sensor, harmonization target, WKT geometry, confidence label and model version are retained.

The website deliberately uses **`detect_f1 = true`**, supplied by the producer, rather than inventing a probability threshold or rounding expected probabilities to counts. Below-threshold candidates are validated but excluded. Stable cell IDs combine fire group and grid coordinates. Duplicate IDs or inconsistent group FRP reject the publication. No raw satellite FRP or model version is invented.

Map points are cell centres, not fire boundaries. Each calendar/export record is a selected **predicted 500 m cell**, not a confirmed VIIRS detection, unique fire, or burned-area measurement. `p_viirs` is a probability; it is not converted into satellite confidence. Cell FRP is indicative. Group FRP is repeated as context in each cell export and must be summed **once per distinct fire_id**, never once per cell. Publication-level group FRP includes all candidate groups and is not a filtered prediction total.

Analyze CSV exports retain the cell/group unit, fire ID, region, source sensor, target, probability, uncertainty, flag, grid coordinates, area, WKT, and group FRP. Existing dates, country/custom-area filters, calendar, heatmap, and search export operate on the selected model records. Explore PDF identifies predictions explicitly. Coverage remains unknown and missing days are not certified zero. The producer validation JSON is visible under Interpretation and validation on both pages.

The example describes daytime Aqua MODIS C6.1, model B logistic predictions and a FRP factor near 0.575. These details come from the example's README; the adapter does not claim a machine-readable model version that the data did not supply. Ask the producer to add `model_version` for reliable provenance across future runs, and explicit scoped coverage metadata before enabling zero-activity or comparable anomaly claims.

## Switch to GCP when ready

On the Express process or hosting platform, configure:

```powershell
$env:HARMONIZED_SOURCE = 'gs://YOUR_BUCKET/published/latest.zip'
$env:HARMONIZED_FORMAT = 'zip'
$env:HARMONIZED_SOURCE_NAME = 'Team harmonized burning activity'
npm run server:start
```

Private GCS uses **Google Application Default Credentials**, rather than a browser API key. Give the web server identity read access to the published object. On GCP, attach the service account to the runtime; locally, use `gcloud auth application-default login` or a server-only `GOOGLE_APPLICATION_CREDENTIALS` path. Do not put secrets in Git, the browser, or `VITE_*`. A Vercel runtime needs its own supported server-side credential setup.

For a teammate HTTPS API that returns the ZIP bytes directly, use its final URL in `HARMONIZED_SOURCE`, set `HARMONIZED_FORMAT=zip`, and optionally `HARMONIZED_API_TOKEN` for bearer authentication. An endpoint that returns only a download-link JSON envelope needs a separate link-resolution contract. Raw GCS folder listing is not implemented: the stable object is the publication boundary.

`HARMONIZED_LOCAL_FILE` is an explicit server-only local preview alternative; it cannot be combined with `HARMONIZED_SOURCE`. Express does not automatically load `.env`; set environment variables on its process or use Node's `--env-file` option. Optional `VITE_API_BASE` selects another backend for local client testing and must contain only a public API base URL, never credentials.

The backend checks for replacements at most once per 60 seconds on request, uses ETags where available, and retains its last valid publication in process memory if an update fails. Explore and Analyze poll in the background once per minute while visible; date/area/source selections remain intact and map zoom does not show a loading screen. Refreshes pause for archive, upload or simulated-data views. Cold starts still require a reachable valid cloud publication. Actual bucket access remains untested until the object path and server identity are provided.

See [the connector configuration](harmonized-feed.md) for byte/row/timeout limits and cache durability.
