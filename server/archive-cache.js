const fs = require('node:fs');
const path = require('node:path');
const filename = path.join(__dirname, 'data', 'vis-test.sqlite');
if (process.argv.includes('--clear')) {
  for (const suffix of ['.archive-v2.sqlite', '.archive-v2.sqlite-wal', '.archive-v2.sqlite-shm']) {
    const target = filename + suffix;
    if (fs.existsSync(target)) fs.unlinkSync(target);
  }
  console.log('Disposable archive query cache cleared. Source index and ZIPs preserved.');
} else {
  const service = require('./archive-service').createArchiveService(filename);
  if (!service) { console.error('Import the archive first: npm run test-data:ingest -- test-data/vis-data'); process.exitCode = 1; }
  else {
    console.log('Preparing archive spatial index and daily cache. First build can take several minutes.');
    service.query('catalog', {}).then(result => console.log('Archive cache ready:', result.identity)).catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => service.close());
  }
}
