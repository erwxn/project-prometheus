# Committed Azure Gold API

The read-only source is `https://stprometheusnasa.blob.core.windows.net/gold/`, discovered exclusively through `catalog/morocco/latest.json`. No example run or Parquet path is hardcoded in production. The SHA-256 of the committed catalog is the public snapshot/version identifier; there is no invented `snapshot_id` field in this actual catalog.

## Verified supplied metadata

| Dataset | Kind | Files | Catalog rows |
| --- | --- | ---: | ---: |
| `morocco_fire_observations` | `source_observation` | 1 | 77,793 |
| `morocco_harmonization_daily_summary` | `harmonization_daily_summary` | 3 | 126 |
| `morocco_harmonized_fire_groups` | `harmonized_fire_group` | 3 | 160 |
| `morocco_harmonized_predictions` | `model_candidate` | 134 | 1,826 |
| `morocco_model_evaluation` | `model_evaluation` | 2 | 117 |
| `morocco_producer_reported_evaluation` | `producer_reported_evaluation` | 3 | 1,430 |

This is **146 files and 81,452 catalog rows**. The subsequent authenticated live check downloaded, checksummed and parsed all of them successfully; the metadata-only check is recorded separately. The earlier three-population subset has 137 files and 79,736 rows. Prediction manifests contain three column schemas, including a genuine zero-row/null-column schema. All complete `files[]` arrays are traversed; no first-file shortcut or fixed single prediction path is used.

## Endpoints

| GET endpoint | Population |
| --- | --- |
| `/api/gold/catalog` | Verified metadata and complete safe file inventories for all six datasets |
| `/api/fire-observations` | Historical FIRMS source observations |
| `/api/model-predictions` | Model candidate cells, including explicitly attested imported outputs |
| `/api/harmonization-daily-summary` | Original daily aggregates |
| `/api/harmonized-fire-groups` | Original harmonized groups |
| `/api/model-evaluations` | Independent evaluation candidate rows, preserving unknown labels |
| `/api/model-evaluations/metrics` | Metrics recomputed for the selected observable candidate population |
| `/api/producer-reported-evaluations` | Imported producer evaluation rows; not independently verified |
| `/api/producer-reported-evaluations/metrics` | Original producer-reported metrics by year, with original-population caveats |

Record responses contain `metadata`, `filters`, `catalog_count`, `scoped_count`, `filtered_count`, `page`, `page_size`, `total_pages` and `data`. Raw catalog counts describe the complete committed inventory; scope/filter counts are calculated from verified rows before pagination. The catalog endpoint preserves complete inventory metadata, including files with zero eligible rows; it does not claim catalog totals are post-filter totals.

All routes set `Cache-Control: no-store`. Gold failures return only static JSON errors with status 400 (invalid request), 409 (snapshot conflict), or 503 (access/integrity/unavailable), plus `Retry-After` for 503. No provider error message, signed URL, SAS, private access-file contents or raw exception is returned or logged. A configured but unavailable Gold source never silently serves catalog example rows or synthetic data.

## Filters and pagination

Record routes accept `start_date` and `end_date` as inclusive UTC `YYYY-MM-DD`, `year`, `sensor`, `source_acquisition`, `bbox=west,south,east,north`, `min_score`, `max_score`, `evaluation_status`, and `label=0|1|unknown` where those fields exist. Scores are not constrained or relabeled as probabilities. Unknown parameters, duplicate scalar values, invalid dates or unsupported population-specific filters return 400. Antimeridian-crossing boxes are supported. National daily aggregates do not support bbox, sensor or score filters; group records do not have sensor or candidate-score filters. Labels/status filters are evaluation-only. Aggregate rows cannot be made into subregional aggregates by a point filter.

`page` starts at 1; `page_size` defaults to 100 and is capped at 1,000. Empty matches return an empty array, `filtered_count: 0` and `total_pages: 0`. `snapshot=<catalog SHA-256>` pins a request to the version actually loaded by the reader and returns 409 after the publication changes. Metrics use the entire matching selection, independent of pagination. Producer metrics accept only `year` and `snapshot`, because they describe an original population rather than arbitrary API filters.

```text
/api/fire-observations?start_date=2019-01-01&end_date=2019-12-31&sensor=VIIRS&page_size=100
/api/model-predictions?year=2014&min_score=0.2&page=2&page_size=100
/api/model-evaluations?label=unknown
/api/model-evaluations/metrics?year=2013
```

Scope requires `country_iso3=MAR` and the committed catalog's `boundary_sha256`, with usable coordinates for point records. The Gold country/boundary assignment is authoritative for this data: the separate app basemap geometry is not used to reclassify verified Gold rows. That extra geometry would incorrectly drop 322 additional observations from the supplied publication. Daily aggregates retain the producer's verified country/boundary assignment and are not spatially redistributed. Western Sahara is not merged into Morocco. Rows without a usable UTC timestamp or dated in 2026 are excluded from record and computed metric responses. This policy applies to the Gold APIs and the Gold-backed Explore/Analyze views; existing legacy feeds retain their behavior. No map outline is added. The API verifies country/boundary provenance, not a separate boundary geometry file that was not supplied.

## Integrity and concurrency

The pointer must have schema version 1 and `COMMITTED` status. Its `catalog_path` must refer to the content-addressed `catalog/morocco/snapshots/<catalog_sha256>/catalog.json`. Catalog bytes are SHA-256 checked before JSON schema validation. The reader requires all six actual dataset dictionary definitions, validates kinds and manifest totals, and confines requests to relative paths in the Gold container. It never follows a metadata URL or reads the metadata/ingestion containers.

Pointer ETags drive conditional refreshes. An `If-Match` pointer check after catalog download detects publication races; 412/conflict retries are bounded to three attempts. Parquet byte length and SHA-256 are checked before decoding, followed by metadata row count and exact column-name checks against **that file's** `schema[]`. Decoded row counts must match. Native nulls, UTC timestamps and safe int64 values are retained; unsupported values fail closed. Per-record `gold_provenance` retains processing/model verification and time-policy caveats. Catalog example rows are never served by the production reader.

Concurrent requests share catalog and table loads. Snapshot/access generations are included in cache keys so overlapping old/new requests cannot mix rows and metadata. Catalog changes invalidate query and metric caches. Every request, including a cache hit, checks signed SAS expiry. Credential replacement clears cached sessions. The previous reader was not supplied; this is a new implementation against the actual ZIP schema, not a claim of reusing an unseen tested implementation.

## Scientific interpretation

- Candidate `harmonization_score` values are uncalibrated model outputs. No calibration, training, threshold fitting, probability labeling or model-score replay occurs here.
- `model_verification_status`, `model_score_replay_verified`, `reference_model_sha256` and source time policies are preserved from the committed manifests. Attested imports remain attested imports.
- Independent evaluation uses only `morocco_model_evaluation`. `viirs_observed_label=null` remains null and never becomes a negative. Non-observable candidates and missing scores are excluded from the denominator.
- Classification thresholds come from the catalog's `metrics_by_acquisition` (0.5 in this supplied snapshot). `diagnostic_label` is not substituted for the observed label or treated as a model prediction. Rates with zero denominators are null. Computed metrics describe the filtered observable candidate population, not national accuracy or calibrated probabilities.
- Live Parquet verification confirmed 79 known labels and 38 unknown labels across the 117 evaluation rows. Only the 79 observable known-label rows enter the computed metrics. Imported producer metrics and `reported_viirs_observed_label` are separate and never enter independent calculations.
- Daily score sums are not observed fire counts. Fire groups are not distinct real-world incidents. Nullable boundary-clipped group FRP is not replaced with the source's un-clipped total. The API preserves the original fields and caveats without inventing coverage or fire-free days.

See [backend connection and deployment](../deploy/BACKEND_CONNECTION.md), [test results](../deploy/evidence/TEST_RESULTS.md), and the separately labelled evidence files there. Live verification has passed locally. Hosting still requires the sensitive Gold environment settings in the actual existing Vercel project and post-deployment endpoint checks; no deployment has been performed by this task.

## Frontend map feed

`GET /api/gold/explorer?sensor=Harmonized|MODIS|VIIRS&page=1` serves verified Morocco GeoJSON in gzip-compressed pages of 10,000 records. Subsequent pages require the returned `gold_snapshot` as `snapshot`. The frontend validates and assembles every page before displaying a source, and rejects partial or mixed publications. This map endpoint is separate from the record APIs and their 1,000-row maximum. Conditional refreshes use ETags after credential and snapshot checks.

Explore and Analyze start with an empty Morocco map while Gold loads, default to model candidates, and show an explicit error on failure. They never replace unavailable Gold data with global demo fires. Raw MODIS and VIIRS observations remain separate from model candidates; model scores are not probabilities.

Producer-reported annual `metrics` may be an object or explicit `null` when unavailable. Null values are preserved, never converted to zero, and cannot invalidate unrelated observation or prediction datasets. These imported metrics remain marked `independently_verified: false`.
