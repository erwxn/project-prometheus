const fs = require('node:fs');
const path = require('node:path');
const { adaptHarmonized } = require('./harmonized-data');

// Validate a local teammate file without publishing or uploading it.
async function main() {
  const file = process.argv[2];
  if (!file) throw new Error('Usage: node server/check-harmonized.js FILE [csv|parquet|json|zip]');
  const maxBytes = Number(process.env.HARMONIZED_MAX_BYTES || 32 * 1024 * 1024);
  if (fs.statSync(file).size > maxBytes) throw new Error('File exceeds the feed byte limit.');
  const data = await adaptHarmonized(fs.readFileSync(file), {
    format: process.argv[3] || path.extname(file).slice(1),
    columns: JSON.parse(process.env.HARMONIZED_COLUMNS || '{}'), jsonPath: process.env.HARMONIZED_JSON_PATH || '',
    maxRows: Number(process.env.HARMONIZED_MAX_ROWS || 100000),
    maxBytes,
  });
  console.log(JSON.stringify(data.metadata, null, 2));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
