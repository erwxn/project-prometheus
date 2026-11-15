import assert from 'node:assert/strict';
import { test } from 'node:test';
import { VectorTile } from '@mapbox/vector-tile';
import { fromVectorTileJs } from '@maplibre/vt-pbf';
import { PbfReader } from 'pbf';
import { basemapRequest, hideCoarseBerm } from '../src/basemap-boundaries.ts';

test('only regional overview tiles use the boundary protocol', () => {
  const base = 'https://tiles.openfreemap.org/planet/version/';
  assert.equal(basemapRequest(`${base}4/7/6.pbf`).url, `prometheus-boundary://${base}4/7/6.pbf`);
  assert.equal(basemapRequest(`${base}4/0/0.pbf`).url, `${base}4/0/0.pbf`);
  assert.equal(basemapRequest(`${base}5/14/13.pbf`).url, `${base}5/14/13.pbf`);
});

test('removes the berm line from a grouped boundary without removing the outer line', () => {
  const berm = [{ x: 2450, y: 2960 }, { x: 2000, y: 3100 }];
  const outer = [{ x: 2450, y: 2960 }, { x: 4100, y: 1900 }];
  const feature = { type: 2, id: 1, properties: { admin_level: 2, maritime: 0, disputed: 0 }, loadGeometry: () => [berm, outer] };
  const layer = { extent: 4096, version: 2, length: 1, feature: () => feature };
  const data = new Uint8Array(fromVectorTileJs({ layers: { boundary: { ...layer, name: 'boundary' }, waterway: { ...layer, name: 'waterway' } } })).buffer;
  const tile = new VectorTile(new PbfReader(hideCoarseBerm(data, 4, 7, 6)));
  const coordinates = name => tile.layers[name].feature(0).loadGeometry().map(line => line.map(({ x, y }) => ({ x, y })));
  assert.deepEqual(coordinates('boundary'), [outer]);
  assert.deepEqual(coordinates('waterway'), [berm, outer]);
});
