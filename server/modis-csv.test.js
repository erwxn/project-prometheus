const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseModisCsv, solarTime } = require('./modis-csv');
const header = 'latitude,longitude,acq_date,acq_time,satellite,confidence,frp';

test('preserves raw measurements, UTC padding, provenance and local date rollover', () => {
  const data = parseModisCsv('\uFEFF' + header + '\r\n-16.76597,-53.37385,2026-11-08,0024,T,100,23.6\r\n');
  const p = data.features[0].properties;
  assert.equal(p.satellite, 'MODIS'); assert.equal(p.platform, 'Terra');
  assert.equal(p.raw_frp, 23.6); assert.equal(p.normalized_frp, null);
  assert.equal(p.acq_time_utc, '00:24'); assert.equal(p.confidence_percent, 100);
  assert.equal(p.local_solar_date, '2026-11-07'); assert.equal(p.local_solar_time, '20:50');
});
test('parses quoted cells and zero FRP without treating zero as missing', () => {
  const data = parseModisCsv(header + '\n"0","0",2026-11-09,30,A,0,0\n');
  assert.equal(data.features[0].properties.acq_time_utc, '00:30');
  assert.equal(data.features[0].properties.platform, 'Aqua');
  assert.equal(data.features[0].properties.raw_frp, 0);
});
test('rejects invalid coordinates, empty values, impossible dates and times', () => {
  const data = parseModisCsv(header + '\n0,0,2026-11-09,1300,T,50,10\n91,0,2026-11-09,1300,T,50,10\n0,0,2026-02-30,1300,T,50,10\n0,0,2026-11-09,2400,T,50,10\n0,0,2026-11-09,1300,T,50,\n');
  assert.equal(data.features.length, 1); assert.equal(data.metadata.rejected_rows, 4);
});
test('bad schema and entirely invalid data fail visibly', () => {
  assert.throws(() => parseModisCsv('latitude,longitude\n0,0'), /Missing CSV column/);
  assert.throws(() => parseModisCsv(header + '\n91,0,2026-11-09,1300,T,50,10'), /no valid/);
});
test('solar date crosses forward at eastern longitudes', () => {
  assert.deepEqual(solarTime('2026-11-09T23:30:00Z', 150), { date: '2026-11-10', time: '09:30' });
});
