const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const app = require('./index');
let server, base;
before(async () => { server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve)); base = `http://127.0.0.1:${server.address().port}`; });
after(async () => { await new Promise(resolve => server.close(resolve)); });
const csv = 'latitude,longitude,acq_date,acq_time,satellite,confidence,frp\n35.7,-5.8,2026-11-09,1330,T,90,44.2\n';
const upload = (body, headers = {}) => fetch(`${base}/api/v1/fires/upload`, { method: 'POST', headers: { 'Content-Type': 'text/csv', ...headers }, body });
const harmonized = (body, format = 'csv') => fetch(`${base}/api/v1/fires/upload-harmonized?format=${format}`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body });

test('harmonized uploads recognize the fire-group delivery and leave the server feed intact', async () => {
  const before = await (await fetch(`${base}/api/v1/fires`)).text();
  const response = await harmonized('lat,lon,time_utc,frp_viirs_eq_mw,fire_id,run\n35.7,-5.8,2014-01-04T13:22:44Z,7.705,group-1,test-model\n');
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.metadata.uploaded, true);
  assert.equal(result.metadata.source, 'harmonized');
  assert.equal(result.metadata.record_unit, 'fire_group');
  assert.equal(result.features[0].id, 'group-1');
  assert.equal(result.features[0].properties.normalized_frp, 7.705);
  assert.equal(result.features[0].properties.raw_frp, null);
  assert.equal(await (await fetch(`${base}/api/v1/fires`)).text(), before);
});

test('the Morocco ZIP uses the same selection rule as the published delivery', async () => {
  const file = readFileSync(join(__dirname, '../test-data/harmonized/delivery_2014_morocco.zip'));
  const response = await harmonized(file, 'zip');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  const result = await response.json();
  assert.equal(result.metadata.uploaded, true);
  assert.equal(result.metadata.record_unit, 'predicted_cell');
  assert.equal(result.metadata.candidate_cells, 444);
  assert.equal(result.metadata.fire_groups, 59);
  assert.equal(result.features.length, 117);
  assert.ok(result.features.every(feature => feature.properties.detect_f1 === true));
});

test('harmonized uploads reject raw MODIS headers, malformed ZIPs, and invalid coordinates', async () => {
  assert.equal((await harmonized(csv)).status, 400);
  assert.equal((await harmonized('contents', 'zip')).status, 400);
  assert.equal((await harmonized(JSON.stringify([{ lat: 91, lon: 0, observed_at_utc: '2014-01-04T13:22:44Z', normalized_frp: 2 }]), 'json')).status, 400);
});
test('upload is session-only, compressed, and preserves raw measurements', async () => {
  const before = await (await fetch(`${base}/api/v1/fires`)).text();
  const response = await upload(csv, { 'X-CSV-Filename': encodeURIComponent('Test MODIS.csv'), 'Accept-Encoding': 'gzip' });
  assert.equal(response.status, 200); assert.equal(response.headers.get('Content-Encoding'), 'gzip');
  const data = await response.json();
  assert.equal(data.features.length, 1); assert.equal(data.features[0].properties.raw_frp, 44.2);
  assert.equal(data.features[0].properties.normalized_frp, null);
  assert.equal(data.metadata.source_name, 'Test MODIS.csv'); assert.equal(data.metadata.uploaded, true);
  assert.equal(await (await fetch(`${base}/api/v1/fires`)).text(), before);
});
test('invalid headers and empty files return actionable errors', async () => {
  const response = await upload('lat,lon\n1,2'); assert.equal(response.status, 400);
  assert.match((await response.json()).error, /Missing CSV column/);
  assert.equal((await upload('')).status, 400);
});
test('partial validation reports excluded rows and filename paths are stripped', async () => {
  const response = await upload(csv + '91,0,2026-11-09,1300,T,50,10\n', { 'X-CSV-Filename': encodeURIComponent('../my.csv') });
  const data = await response.json(); assert.equal(data.features.length, 1);
  assert.equal(data.metadata.rejected_rows, 1); assert.equal(data.metadata.source_name, 'my.csv');
});
test('wrong type and oversized requests return JSON rather than HTML', async () => {
  assert.equal((await upload(csv, { 'Content-Type': 'text/plain' })).status, 415);
  const response = await upload('x'.repeat(3 * 1024 * 1024 + 1)); assert.equal(response.status, 413);
  assert.match((await response.json()).error, /3 MB/);
});
test('temporary endpoint can be disabled without code changes', async () => {
  const previous = process.env.ENABLE_CSV_UPLOAD; process.env.ENABLE_CSV_UPLOAD = 'false';
  try { assert.equal((await upload(csv)).status, 404); }
  finally { if (previous === undefined) delete process.env.ENABLE_CSV_UPLOAD; else process.env.ENABLE_CSV_UPLOAD = previous; }
});
