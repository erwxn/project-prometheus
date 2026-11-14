# Temporary Vis data ingestion

The original ZIP files in `C:/Users/aouam/Downloads/Vis data/` remain untouched.
The local index is stored in Git-ignored `server/data/vis-test.sqlite`; its audit
report is `server/data/vis-test-report.json`. Neither is deployed or committed.

The initial import indexed **6,525,167 unique observations** across 934
platform/month slices from 11 ZIP files (22 CSV members). Of 17,482,180 input
rows, 10,957,013 overlapping duplicates were removed and no rows were rejected.

The importer reads archive and near-real-time CSVs directly from ZIPs, validates
coordinates, UTC dates/times, sensor-specific confidence and nonnegative FRP, and
deduplicates overlapping downloads by platform, location, UTC date and minute.
Archive records take precedence over overlapping near-real-time records. This is
record deduplication, not identification of unique fire events. Source ZIP/CSV
provenance stays attached to observations. MODIS and VIIRS remain separate raw
sensors; normalized FRP is unavailable and coverage/baselines are not invented.

While the index exists, the default server dataset is its latest MODIS month.
Refresh the app and use **Historical Fire Archive Explorer** to choose a satellite,
year, month, or UTC date range. The dashboard now aggregates the entire applied
selection on the backend; map observations are loaded separately in pages of up
to 10,000. Original month/page endpoints remain available for compatibility.
See [HISTORICAL_ARCHIVE.md](HISTORICAL_ARCHIVE.md) for the current walkthrough,
query APIs, sidecar preparation, scientific limitations, and validation.

Rebuild (stop the API server first if replacing an existing index):

```powershell
npm run test-data:ingest -- "C:/Users/aouam/Downloads/Vis data"
npm run server:dev
```

To remove the temporary data later, stop the API server, then run:

```powershell
npm run test-data:clear
npm run server:dev
```

This removes only the generated index/report. The API returns to its original
configured MODIS CSV or labeled demo dataset. The optional picker disappears on
refresh. The original ZIPs are never removed by this command. Node 24+ and Python
3 are used; no new npm dependency is required.
