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
Refresh the app and use **Temporary archive test data → Test dataset** to select
Terra, Aqua, SNPP, N20 or N21 and a month. All indexed records are accessible.
Each response contains at most 50,000 observations; unusually large months have
Previous/Next slice buttons. The map, calendar, statistics and charts describe
only the loaded slice, explicitly labeled in the interface. Explorer playback
can use **Full filtered file** to show the whole loaded month instead of 24 hours.

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
