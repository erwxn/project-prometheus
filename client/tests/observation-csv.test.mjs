import { test } from 'node:test';
import assert from 'node:assert/strict';
import { observationCsv } from '../src/observation-csv.ts';

test('CSV preserves coordinate order, missing values, FRP units and dataset provenance', () => {
  const fires = [{
    geometry: { coordinates: [-7.25, 32.5] },
    properties: {
      satellite: 'MODIS', observed_at_utc: '2023-07-04T13:05:00Z',
      acq_time_utc: '13:05', platform: 'Aqua', confidence: 'nominal',
      raw_frp: 0, normalized_frp: null,
    },
  }];
  const csv = observationCsv(fires, { source: 'simulated', source_name: 'North, "test"', version: ' =1+1' });
  const [header, row, end] = csv.split('\r\n');
  assert.match(header, /^latitude,longitude,observed_at_utc/);
  assert.match(header, /raw_frp_mw,harmonized_frp_mw/);
  assert.equal(row, `32.5,-7.25,"2023-07-04T13:05:00Z","13:05","MODIS","Aqua","nominal",,0,,"simulated","North, ""test""","' =1+1",,`);
  assert.equal(end, '');
});
