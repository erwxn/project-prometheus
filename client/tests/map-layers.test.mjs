import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepareObservations } from '../src/analytics-engine.ts';
import { selectMapLayers } from '../src/map-layers.ts';

test('map layers combine sources independently of chart sensor while retaining date and area filters', () => {
  const feature = (satellite, date, lon = 0) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [lon, 0] }, properties: { satellite, observed_at_utc: date + 'T12:00:00Z' } });
  const rows = prepareObservations([
    feature('MODIS', '2023-07-01'), feature('VIIRS', '2023-07-01'), feature('Harmonized', '2023-07-01'),
    feature('VIIRS', '2022-01-01'), feature('MODIS', '2023-07-02'), feature('MODIS', '2023-07-01', 10),
  ]);
  const filters = { sensor: 'MODIS', metric: 'detections', country: null, simulatedPlatform: null, startDate: '2023-07-01', endDate: '2023-07-02', selectedDay: '2023-07-01', area: { type: 'Feature', properties: { kind: 'rectangle' }, geometry: { type: 'Polygon', coordinates: [[[-1,-1],[1,-1],[1,1],[-1,1],[-1,-1]]] } } };
  assert.deepEqual(selectMapLayers(rows, filters, ['MODIS', 'VIIRS', 'Harmonized']).map(r => r.sensor), ['MODIS', 'VIIRS', 'Harmonized']);
  assert.deepEqual(selectMapLayers(rows, filters, ['VIIRS', 'Harmonized']).map(r => r.sensor), ['VIIRS', 'Harmonized']);
  assert.equal(selectMapLayers(rows, filters, []).length, 0);
  assert.equal(filters.sensor, 'MODIS');
});
