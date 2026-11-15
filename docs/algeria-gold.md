# Algeria Gold integration

The existing authenticated Gold reader now supports separate, allowlisted Morocco, Algeria and Morocco-Algeria committed publications. Morocco remains the default. The connection, SAS permissions, ingestion pipeline and frozen model are unchanged.

## Root cause

Before the change, the local backend returned HTTP 400 with GOLD_400 for GET /api/model-predictions?country=DZA&year=2015. The query validator did not accept country, the reader discovered only catalog/morocco/latest.json, service scope required MAR, and projected map features were assigned MAR. The frontend also accepted only MAR Gold responses; selecting Algeria changed a geographic filter without loading Algeria data.

## API and dashboard

- GET /api/model-predictions?country=DZA&year=2015 (default 100 records, maximum page_size=1000). Country, UTC date/year, score and geographic filters run before pagination. Pin subsequent pages with metadata.snapshot.
- GET /api/gold/catalog?country=DZA exposes the Algeria catalog; unsupplied FIRMS observations and independent evaluation are explicitly unavailable.
- GET /api/gold/explorer?country=DZA supports the separate model map population. No raw MODIS/VIIRS observation layer is invented for Algeria.
- GET /api/comparisons/morocco-algeria?year=2015 serves the committed 24-row monthly comparison. It verifies both immutable source catalog hashes at their pinned paths, not their potentially newer latest pointers.

Explorer country search and the Gold country selector now trigger the selected publication load. Algeria loads all eight prediction pages atomically through /api/model-predictions and initializes its available 2015 dates. Unchanged background refreshes use a single conditional request after credential/snapshot checks instead of downloading eight pages again. ETag is exposed to the local development frontend through CORS. Wrong-country, incomplete and mixed-snapshot responses fail without substituting Morocco or demo records. Verified Gold country assignments govern country filters; user-drawn areas still apply. Analytics map layers switch with the country. The existing Places section shows the pinned 2015 comparison for Gold data, without national density/rate calculations.

Scores remain uncalibrated Model B outputs, not confirmed fires or probabilities. Comparison status is DESCRIPTIVE_ONLY_COVERAGE_UNVERIFIED. Missing coverage and null labels remain unknown. Supplied comparison zeros mean no exported candidates, not no fires. Imported evaluation is not independent accuracy.

## Executed local verification

Run npm run gold:start with PORT=5059, then node server/check-algeria.mjs. Set PROMETHEUS_CHECK_API_BASE when checking a different local port. The existing ignored backend SAS settings are reused; no credential is bundled or printed. Do not point this full verification at a hosted rate-limited deployment without selecting an appropriate verification window.

- Actual read-only Azure access passed; signed credential expires 2026-11-22 at 07:59 UTC.
- Algeria committed catalog 94526b239758bb3aed2eb75ae9730ecdadd6da3edef010c6d2fa4c67700723ee verified.
- All 150 declared prediction Parquet files passed SHA-256, byte-length, row-count and column validation: 7,031 unique DZA records, all 2015; all eight API pages verified.
- Comparison catalog 397ee9a82cde086fd21ceb12b7093d9f22445acbf58d88aaed6bdf18413c81df verified; its actual Parquet file contains 24 rows, 622 MAR cells and 7,031 DZA cells, with 20 shared acquisitions. Complete comparison pagination verified.
- Filtered day 2015-09-22 returned 53 Algeria candidates before pagination. Wrong-year/empty spatial selections, unsupported countries, invalid page sizes and snapshot conflicts passed.
- Morocco remains default: 2,448 model candidates across the supplied historical range; 622 in 2015. Browser verified Algeria search, all 7,031 map candidates, 2015 dates, the comparison chart/warnings, and switching back to Morocco.
- Full offline regression suite: 155 passed. Production build and secret scan passed. Frontend lint completed with its existing AnalyticsPage set-state-in-effect warning.

Exact public metadata fixtures are retained for regression testing, never as runtime data fallbacks. Detailed actual-read evidence is in deploy/evidence/algeria-verification.json. MOROCCO_ALGERIA_BACKEND.md and separate supplied Python/Node handoff files were not found in the repository, Downloads, Desktop or Documents; implementation used the verified committed Azure schemas and existing Node reader.

## Deployment status

This is locally verified work only; it has not been pushed or publicly deployed. No new service or Azure role is required. Use the existing repository-root Vercel configuration and server-only production SAS environment. Automatic custom-domain assignment was previously verified disabled: after building a tested revision, explicitly promote it and verify the public domain alias and API responses. Renew the read-only SAS privately before expiry.
