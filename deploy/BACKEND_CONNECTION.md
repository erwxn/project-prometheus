# Azure Gold backend handoff

The backend is implemented against the actual metadata in `prometheus_gold_catalog.zip`, not the previously described missing implementation. The exact supplied `latest.json` and `catalog.json` are retained under `server/fixtures/gold-catalog/` for reproducible schema tests. They contain no credentials or Parquet data and are never a runtime substitute for Azure.

The verified supplied catalog SHA-256 is `3784da0a527f3ed02b89383dabc93a5eb1041fe066140d1db21e0484c202ab2e`. Its pointer has `catalog_path`, `catalog_sha256`, `schema_version: 1`, and `status: COMMITTED`. Its `datasets` member is a dictionary. File definitions use `blob_path`, `container`, `bytes`, `rows`, `schema[]`, and `sha256`. Runtime paths always come from the authenticated committed catalog.

## Local commands

```powershell
npm run gold:test
npm run gold:check -- --metadata-only
npm run gold:check -- --offline
npm run gold:start
npm run gold:check
```

`gold:start` starts the existing Express application. `gold:check` starts a private ephemeral HTTP listener for verification, so it does not require or interfere with port 5000. The metadata-only check verifies the actual ZIP-derived hash and all manifest definitions. The offline check uses synthetic Parquet payloads with the real paths and column schemas, with fixture hashes/counts explicitly substituted; it does not claim that Azure Parquet bytes have been downloaded. Only the default live check accesses actual Azure data. It exits with code 2 when valid credentials are unavailable; integrity or API failures use code 1.

Configure a renewed read-only container SAS in the ignored `server/.env.gold.local`, or set it directly in the backend process:

```text
PROMETHEUS_GOLD_AUTH=sas
PROMETHEUS_GOLD_SAS_TOKEN=<operator-issued read-only Gold container SAS query string>
```

Use `sr=c`, `sp=r` (or `rl`), and HTTPS. The reader rejects write permissions and account-wide SAS tokens, checks actual signed expiry (`se`) and any delegation-key validity (`skt`/`ske`) on every request, and never falls back to a developer/operator login. The previous credential expired on 2026-11-15 at 07:20:32 UTC. A renewed credential is now configured only in ignored local settings and expires on 2026-11-22 at 07:59 UTC. Do not edit expiry values to simulate renewal; obtain a new SAS through the authorized private channel. Local settings do not override existing process variables and are not loaded in Vercel/production.

An optional external private access file is supported instead of the token variable: set `PROMETHEUS_GOLD_ACCESS_FILE` to its absolute path and omit `PROMETHEUS_GOLD_SAS_TOKEN`. Required JSON fields are `account` (`stprometheusnasa`), `container` (`gold`), `sas_token` (the operator-issued query string), and `expires_at` (the operator-issued UTC expiry). The earlier described access JSON was not provided, so its unknown field layout is not assumed compatible. The reader checks the earlier of its expiry and signed `se`, reads the file again on cached requests, and clears its session and caches when the content changes. Neither the file nor its contents belong in Git, build output, browser code or evidence.

Restart a locally running server after changing `.env.gold.local`; process environment settings are loaded at startup. Replacing the external private access JSON is detected on each request without a restart. Vercel environment changes require a new deployment.

## Scope and readiness

See [the API and scientific contract](../docs/gold-backend.md) and [executed verification results](evidence/TEST_RESULTS.md). All Gold record responses are restricted to Morocco and exclude 2026. Explore and Analyze now use `/api/gold/explorer` with a Morocco-centered map and no global demo fallback. Harmonized model candidates are the default; MODIS and VIIRS observations load separately. Existing `/api/v1/*` feeds, ingestion and the frozen model retain their behavior.

No cloud data is written, no ingestion is rebuilt, no operator identity is reused, and no Vercel project is created. Live validation has now passed with the renewed credential: all 146 files and 81,452 rows were verified, and all six record endpoints passed complete pagination checks. The 6,880 observations dated in 2026 are excluded, leaving 70,913 served observations. Independent evaluation retains 79 known labels and 38 unknown labels. See the executed evidence for the full per-dataset results. The ZIP alone did not establish these results; the live check downloaded and parsed actual Azure Parquet data.

## Existing Vercel project

Use the already existing project and repository root. Configure the two Gold variables above as backend-only production environment variables, then redeploy through the project's normal workflow after local/live verification succeeds. Do not use `VITE_*`. The committed function configuration includes `deploy/backend/**` and excludes private access JSON, metadata fixtures, synthetic helpers and local evidence. Do not bundle a developer's access-file path into Vercel; use the sensitive server token variable there.

The function duration remains 60 seconds. Downloads are bounded to four concurrent files, 15 seconds per request, 32 MiB per Parquet file, 128 MiB of catalog-declared Parquet bytes, 250,000 declared rows and 512 files. Public responses are capped at 4 MiB; lower `page_size` if a response is too large. The Gold cache is per-process and cold starts require reachable authenticated Azure. Actual latency and memory usage must be measured with the real files before relying on hosted performance.

For production identity, identify the actual backend workload and obtain a dedicated principal/object ID. Give that ID to the storage operator for `Storage Blob Data Reader` at the `stprometheusnasa` Gold container scope only. Do not reuse the ingestion principal or create a permanent password. Managed/federated identity acquisition is not implemented by this SAS reader; that authentication change requires a separately verified workload identity configuration. Subscription/resource-group details and the backend principal were not supplied and are not invented here.

## Serverless dependency tracing

Gold service helpers use static imports so Vercel includes them in the function bundle. `node --test server/deployment.test.js` verifies the dependency trace from the real `api/index.js` entrypoint, including the Gold map helper and Parquet reader. Local API tests alone do not detect omitted deployment dependencies.

## Production promotion requirement

As verified on 2026-11-15, the existing Vercel project has `autoAssignCustomDomains: false`. A READY build does not establish that `www.prometheusnasa.earth` serves it. Confirm the domain alias deployment ID, explicitly promote the verified production deployment, then verify the public map and request logs. The Gold catalog-null-metrics fix at `eac0e70` was promoted as `dpl_6niqmeyDMTRfSDeBihN8evLqaAQN`; the live domain returned HTTP 200 for `/api/gold/explorer` and displayed 2,448 real model candidates. Automatic assignment was not changed.

## Algeria and pinned 2015 comparison

See [Algeria integration and verification](../docs/algeria-gold.md). The existing reader now accepts an allowlisted publication profile; Morocco remains the default. Algeria selection loads the separate DZA prediction API, and the Gold Places view reads the committed Morocco-Algeria comparison with pinned source versions. This extension is locally verified and has not been publicly deployed.
