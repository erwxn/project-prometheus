const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { once } = require('node:events');

// Load the same entrypoint and historical sample configured for the hosted preview.
process.env.VERCEL = '1';
delete process.env.HARMONIZED_SOURCE;
process.env.HARMONIZED_LOCAL_FILE = path.join(__dirname, '../test-data/harmonized/delivery_2014_morocco.zip');
const app = require('../api/index');

test('hosted entrypoint serves health, harmonized sample, JSON search and complete CSV export', async () => {
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(`${base}/health`)).status, 200);
    const response = await fetch(`${base}/api/v1/fires`);
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.metadata.preview, true);
    assert.equal(data.metadata.record_unit, 'predicted_cell');
    assert.equal(data.features.length, 117);
    const query = { source: 'snapshot', sensor: 'Harmonized', startDate: '2014-01-01', endDate: '2014-12-31', expectedVersion: data.metadata.version };
    const post = endpoint => fetch(`${base}/api/v1/history/${endpoint}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(query) });
    const search = await post('query');
    assert.equal(search.status, 200);
    assert.match(search.headers.get('content-type'), /application\/json/);
    const exported = await post('export.csv');
    assert.equal(exported.status, 200);
    assert.match(exported.headers.get('content-type'), /text\/csv/);
    const csv = await exported.text();
    assert.equal(csv.trim().split('\r\n').length, 118);
    assert.match(csv, /predicted_cell/);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});
