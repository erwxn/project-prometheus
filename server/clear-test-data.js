const fs = require('node:fs');
const path = require('node:path');
for (const name of ['vis-test.sqlite', 'vis-test-report.json', 'vis-test.building.sqlite']) {
  const target = path.join(__dirname, 'data', name);
  if (fs.existsSync(target)) fs.unlinkSync(target);
}
console.log('Temporary test index removed. Restart the server. Original ZIP files were preserved.');
