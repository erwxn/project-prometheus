# Temporary visualization test data

These 11 NASA FIRMS ZIP downloads are temporary test inputs, copied from the original Vis data folder. Originals remain unchanged. They include overlapping archive/NRT records; the importer deduplicates them.

From the repository root, with Python 3 and Node 24+:

```powershell
npm install
npm run test-data:ingest -- test-data/vis-data
npm run server:dev
# In another terminal:
npm run client:dev
```

Open /analytics/ and select a platform/month under Test dataset. The generated SQLite index stays Git-ignored. Statistics describe only the loaded slice.

To clear the generated index, stop the API and run `npm run test-data:clear`. This keeps the ZIP inputs. The entire test-data/vis-data folder can be removed from the repository when testing is finished.
