const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { zipSync, unzipSync } = require('fflate');
const { adaptHarmonized, readTable } = require('./harmonized-data');
const { adaptCells } = require('./harmonized-delivery');
const { feedConfig, createHarmonizedFeed } = require('./harmonized-feed');
const { snapshotRows, aggregates } = require('./history-routes');
const samplePath = path.resolve(__dirname, '../test-data/harmonized/delivery_2014_morocco.zip');
const sample = fs.readFileSync(samplePath);

test('real team ZIP selects 117 predicted cells from 444 candidates without duplicating partitions', async () => {
  const data = await adaptHarmonized(sample, { format: 'zip' });
  assert.equal(data.features.length, 117);
  assert.equal(data.metadata.candidate_cells, 444);
  assert.equal(data.metadata.fire_groups, 59);
  assert.equal(data.metadata.excluded_below_threshold, 327);
  assert.equal(data.metadata.record_unit, 'predicted_cell');
  assert.equal(data.metadata.coverage_status, 'unknown');
  assert.equal(data.metadata.coverage, undefined);
  assert.equal(data.metadata.validation['accuracy_2014.json'].cells_observed_by_viirs, 116);
  assert.equal(new Set(data.features.map(f => f.id)).size, 117);
  assert.ok(data.features.every(f => f.properties.detect_f1 && f.properties.raw_frp === null && f.properties.p_viirs >= 0 && f.properties.cell_wkt.startsWith('POLYGON')));
  assert.ok(Math.abs(data.metadata.group_frp_total_mw - 1913.179170996857) < 1e-8);
  assert.deepEqual(data.metadata.delivery_tables, ['cells_frp_2014.parquet']);
  const selected = snapshotRows(data, { startDate: '2014-03-16', endDate: '2014-03-16', sensor: 'Harmonized', country: 'MAR' });
  assert.equal(selected.length, 2);
  assert.equal(aggregates(selected).daily[0].count, 2);
});

test('partition-only delivery equals flat-table delivery; individual Parquet tables and CSV cells work', async () => {
  const files = unzipSync(sample);
  const expected = await adaptHarmonized(sample, { format: 'zip' });
  const parquet = await adaptHarmonized(Buffer.from(files['cells_frp_2014.parquet']), { format: 'parquet' });
  delete files['cells_frp_2014.parquet'];
  const partitioned = await adaptHarmonized(Buffer.from(zipSync(files)), { format: 'zip' });
  assert.deepEqual(partitioned.features, expected.features);
  assert.deepEqual(parquet.features, expected.features);
  const groups = await adaptHarmonized(Buffer.from(files['fires_2014.parquet']), { format: 'parquet' });
  assert.equal(groups.features.length, 59);
  assert.equal(groups.metadata.record_unit, 'fire_group');
  assert.ok(Math.abs(groups.features.reduce((sum, f) => sum + f.properties.normalized_frp, 0) - expected.metadata.group_frp_total_mw) < 1e-8);
  // CSV producer exports use string booleans and numeric fields.
  const cellCsv = 'cell_lon,cell_lat,time_utc,fire_id,cell_column,cell_row,p_viirs,p_uncertainty,cell_area_km2,detect_f1,frp_group_viirs_eq_mw,frp_cell_mw\n-5,34,2014-01-01T12:00:00Z,g1,1,2,0.5,0.1,0.25,true,12,3';
  assert.equal((await adaptHarmonized(Buffer.from(cellCsv))).features.length, 1);
  await assert.rejects(adaptHarmonized(Buffer.from(cellCsv.replace('cell_lon,', 'cell_lat,'))), /Duplicate/);
});

test('malformed, duplicate, oversized and missing cell publications are rejected atomically', async () => {
  const files = unzipSync(sample);
  const { rows } = await readTable(Buffer.from(files['cells_frp_2014.parquet']), { format: 'parquet' });
  for (const patch of [{ p_viirs: 2 }, { detect_f1: 'no' }, { cell_area_km2: 0 }, { cell_lat: 91 }, { time_utc: 'invalid' }]) {
    await assert.rejects(adaptCells([{ ...rows[0], ...patch }]));
  }
  await assert.rejects(adaptCells([rows[0], rows[0]]), /Duplicate/);
  await assert.rejects(adaptHarmonized(sample, { format: 'zip', maxRows: 443 }), /limit/);
  delete files['cells_frp_2014.parquet'];
  await assert.rejects(adaptHarmonized(Buffer.from(zipSync(files)), { format: 'zip', maxRows: 443 }), /limit/);
  await assert.rejects(adaptHarmonized(sample, { format: 'zip', maxBytes: sample.length + 1 }), /expanded/);
  await assert.rejects(adaptHarmonized(Buffer.from(zipSync({ '../bad': Buffer.from('x') })), { format: 'zip' }), /Unsafe/);
  await assert.rejects(adaptHarmonized(Buffer.from(zipSync({ 'readme.txt': Buffer.from('x') })), { format: 'zip' }), /no cell/);
});

test('GCS ZIP and explicit local preview share adapter and safe refresh behavior', async () => {
  const cfg = feedConfig({ HARMONIZED_SOURCE: 'gs://team/published/latest.zip' });
  let now = 0, valid = true;
  const feed = createHarmonizedFeed(cfg, { now: () => now, getAccessToken: async () => 'test-token', fetchImpl: async () => new Response(valid ? sample : 'invalid ZIP') });
  const first = await feed.get();
  assert.equal(first.features.length, 117);
  valid = false; now += 60001;
  const stale = await feed.get();
  assert.equal(stale.metadata.version, first.metadata.version);
  assert.equal(stale.metadata.feed_status, 'stale');
  const local = await createHarmonizedFeed(feedConfig({ HARMONIZED_LOCAL_FILE: samplePath })).get();
  assert.equal(local.features.length, 117);
  assert.equal(local.metadata.preview, true);
  assert.equal(JSON.stringify(local).includes(samplePath), false);
  assert.throws(() => feedConfig({ HARMONIZED_LOCAL_FILE: samplePath, HARMONIZED_SOURCE: 'gs://team/latest.zip' }), /either/);
});
