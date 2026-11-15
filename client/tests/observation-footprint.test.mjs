import { test } from 'node:test';
import assert from 'node:assert/strict';
import { observationFootprint } from '../src/observation-footprint.ts';

test('Explore draws model geometry, scan dimensions and nominal sensor sizes', () => {
  const footprint = properties => observationFootprint({ type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] }, properties });
  const width = ring => Number(((ring[1][0] - ring[0][0]) * 111.32).toFixed(6));
  assert.equal(width(footprint({ satellite: 'MODIS' })), 1);
  assert.equal(width(footprint({ satellite: 'VIIRS' })), 0.375);
  assert.equal(width(footprint({ satellite: 'MODIS', scan_km: 2 })), 2);
  assert.equal(width(footprint({ satellite: 'Harmonized', record_unit: 'model_candidate' })), 0.5);
  assert.deepEqual(footprint({ record_unit: 'predicted_cell', cell_wkt: 'POLYGON((0 0, 0.004 0, 0.004 0.004, 0 0.004, 0 0))' })[1], [0.004, 0]);
  assert.equal(footprint({ satellite: 'Harmonized', record_unit: 'fire_group' }), null);
});

