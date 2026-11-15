# Morocco dashboard data

The dashboard/API covers the OCHA COD-AB Morocco study polygon, with Western Sahara represented separately. The version, source, licence and SHA-256 are recorded in `server/config/morocco.metadata.json`. The shared MAR selector uses this same geometry; other generic country-helper definitions from main are preserved. Country search offers Morocco only.

This commit contains dashboard/backend changes only. The separate NASA pipeline prepares the data. Generated datasets, scientific inputs, model weights and credentials are not included in this repository update.

## Local inputs

Place verified exports in the existing ignored `server/data/` directory:

- `morocco.sqlite`: the existing archive observations/partitions schema, populated only with polygon-filtered, deduplicated FIRMS records.
- `morocco-predictions.geojson`: a FeatureCollection of real model-scored cells, never synthetic fallbacks.
- `morocco-dataset.json`: export provenance, run IDs, row counts and `predictions_sha256` for the GeoJSON bytes.

The API uses `morocco.sqlite` for archive queries and verifies the prediction snapshot checksum on every read. Without these exports it returns empty/unavailable data rather than generated observations. `GET /api/v1/fires/predictions` returns 503 if the verified export is absent or inconsistent. `/api/v1/fires/sample` is empty. Existing response point collections are filtered by the study polygon.

The completed pilot export has 77,793 source FIRMS observations and 35 candidate cells from Aqua acquisition A2011168.1345. Model properties include `harmonization_score`, `prediction_status`, `model_version`, `model_sha256`, `source_acquisition`, `run_id` and `time_precision`. `raw_frp` is null for model cells; `normalized_frp` is the stored model-derived cell FRP estimate. Source observations retain measured FRP and null normalized FRP. Predictions are historical estimates, with no VIIRS truth/accuracy claim for 2011.

The API and UI expose model scores separately from observed detections. Use **Dataset and custom dates > Load verified model pilot** in Explore. Actual observation date bounds do not establish complete sensor coverage.

## Run and check

Run the existing API (`node server/index.js`) and frontend (`npm --prefix client run dev`). The development API defaults to localhost:5000; set VITE_API_BASE to the correct API URL when using another port.

Checks: `node --test server/*.test.js`, `npm --prefix client test`, and `npm test` (secret scan and production build).
