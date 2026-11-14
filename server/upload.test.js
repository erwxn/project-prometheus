const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const app = require('./index');
let server, base;
before(async () => { server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve)); base = `http://127.0.0.1:${server.address().port}`; });
after(async () => { await new Promise(resolve => server.close(resolve)); });
const csv = 'latitude,longitude,acq_date,acq_time,satellite,confidence,frp\n35.7,-5.8,2026-11-09,1330,T,90,44.2\n';
const upload = (body, headers = {}) => fetch(`${base}/api/v1/fires/upload`, { method: 'POST', headers: { 'Content-Type': 'text/csv', ...headers }, body });
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
