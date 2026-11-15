# Executed Gold verification â€” 2026-11-15 UTC

Local readiness: **passed**, including authenticated reads from actual Azure Gold. Production deployment: **not performed**. Azure writes: **none**. The frontend, legacy `/api/v1/*` feeds, ingestion and frozen model were preserved.

## Results

| Command | Executed result |
| --- | --- |
| `node --test client/tests/*.test.mjs server/*.test.js` | 140 passed, zero failed; includes 16 Gold regression tests |
| `npm run gold:test` | 16 passed, zero failed |
| `npm run gold:check -- --metadata-only` | Actual supplied pointer/catalog hash and all six definitions passed |
| `npm run gold:check -- --offline` | Synthetic Parquet fixtures using all 146 actual manifest paths and per-file schemas passed; explicitly not Azure data |
| `npm run gold:check` | Actual Azure catalog, all 146 Parquet checksums/byte lengths/row counts/column-name sets, and local HTTP API checks passed |
| `npm run build` | Passed; existing Vite large-chunk warnings remain |
| `npm --prefix client run lint` | Passed |
| `npm run lint:secrets` | Passed; private local configuration remains ignored |

The verified live catalog SHA-256 is `3784da0a527f3ed02b89383dabc93a5eb1041fe066140d1db21e0484c202ab2e`, matching the ZIP-derived pointer. This is the version actually returned by the reader and public API, not an assumed or invented revision.

## Actual Azure data

| Population | Files verified | Rows parsed | Rows eligible for API | Pages verified at 1,000 |
| --- | ---: | ---: | ---: | ---: |
| Historical observations | 1 | 77,793 | 70,913 | 71 |
| Daily summaries | 3 | 126 | 126 | 1 |
| Fire groups | 3 | 160 | 160 | 1 |
| Predictions | 134 | 1,826 | 1,826 | 2 |
| Independent evaluation | 2 | 117 | 117 | 1 |
| Producer-reported evaluation | 3 | 1,430 | 1,430 | 2 |
| Total | 146 | 81,452 | 74,572 | 78 |

The 6,880 excluded observations are dated in 2026. Gold country/boundary provenance is used consistently; a diagnostic found that reapplying a different basemap geometry would discard 322 additional source-vetted Morocco records, so that reclassification is not applied.

The positive 2019 VIIRS filter returned **5,757** matches, verified independently against loaded rows. Inclusive dates, source filtering, complete pagination, outside-region empty results, excluded-year empty results, invalid pagination (400), and stale snapshot requests (409) passed locally using actual downloaded data. The public catalog endpoint returned all six dataset definitions with their complete safe file inventories.

Independent evaluation preserved **79 known and 38 unknown labels**. The computed denominator is the 79 observable known-label candidates only: TP 4, FP 2, TN 63, FN 10. Classification thresholds are 0.5 as documented by the catalog's per-acquisition metrics. These results are not national accuracy or evidence of probability calibration. Producer-reported metrics are returned separately with `independently_verified=false` and were not merged into this calculation.

## Regression and failure coverage

Offline tests exercise uncommitted pointers, catalog checksum errors, pointer ETag changes and bounded 412 retries; corrupt Parquet bytes, wrong byte lengths, row counts and column names; zero-row files; filtering before pagination; nullable labels; unobservable known labels; zero denominators; credential expiry on cached requests, including delegation-key expiry; refusal to extend signed expiry through JSON edits; read-only container SAS validation; external credential replacement; query/metric invalidation after catalog changes; actual reader-version conflicts; and overlapping old/new snapshot requests without cache contamination.

The full application smoke test verifies that health and existing legacy samples remain available while missing Gold access returns sanitized 503 JSON. Error bodies never include provider messages or credentials. No Azure write probe was issued: this task must not modify Gold, and the reader refuses write-granting SAS permissions before network I/O.

## Evidence and remaining deployment work

- [Live verification](local-gold-verification.json): actual Azure results and API checks.
- [Public response examples](api-response-examples.json): actual sanitized public records and metadata summaries; samples are labelled as partial captures.
- [ZIP metadata verification](catalog-metadata-verification.json): checks on the supplied files only.
- [Offline transport verification](offline-gold-verification.json) and [offline responses](offline-api-response-examples.json): clearly labelled synthetic fixtures, not live measurements.

The renewed credential is stored only in ignored local backend settings. It expires **2026-11-22 at 07:59 UTC**; rotation requires a newly issued credential, not editing expiry fields. Deployment still needs backend-only Gold environment variables in the actual existing Vercel project, a redeploy, and hosted endpoint/latency checks. No Vercel project or principal/object ID was invented. The dedicated production backend identity and Gold-container-only `Storage Blob Data Reader` handoff remain pending; no ingestion identity or permanent password was reused.

## Morocco frontend connection fix — 2026-11-15

- Full local regression suite: 146 passed, 0 failed.
- Frontend lint, secret scan and production build passed. Existing bundle-size warnings remain.
- Actual Gold map data verified locally: 1,826 model candidates, 8,194 MODIS observations and 62,719 VIIRS observations, all Morocco-scoped and excluding 2026.
- Browser verification confirmed the default model map and complete paginated VIIRS source load. Initial and failed loads cannot show worldwide demo points.
- Map pages are gzip-compressed, snapshot-pinned, and assembled before replacing the displayed dataset. Unchanged refreshes support conditional 304 responses after access checks.
- Public production API verification was blocked by Vercel HTTP 429; local verification does not establish production deployment readiness.
