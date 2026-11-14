import { test } from 'node:test';
import assert from 'node:assert/strict';
import { areaBounds, areaPredicate, radiusArea, validateArea, validateDrawingArea } from '../src/area-selection.ts';
import { polygon } from './analytics-fixtures.mjs';
import { TerraDraw, TerraDrawPolygonMode, TerraDrawSelectMode } from 'terra-draw';

test('concave polygon filtering includes boundary points and excludes its bounding-box cutout', () => {
  const area = polygon([[0, 0], [4, 0], [4, 1], [1, 1], [1, 4], [0, 4], [0, 0]]);
  assert.equal(validateArea(area), null);
  const contains = areaPredicate(area);
  assert.equal(contains([0, 0]), true); assert.equal(contains([.5, 3]), true);
  assert.equal(contains([2, 2]), false); assert.equal(contains([5, 5]), false);
  assert.deepEqual(areaBounds(area), [[0, 0], [4, 4]]);
});

test('geometry validation rejects open, degenerate, crossing, and out-of-bounds polygons', () => {
  for (const ring of [[[0, 0], [1, 0], [1, 1], [0, 1]], [[0, 0], [1, 1], [2, 2], [0, 0]], [[0, 0], [2, 2], [0, 2], [2, 0], [0, 0]], [[181, 0], [182, 0], [182, 1], [181, 0]]]) assert.ok(validateArea(polygon(ring)));
  assert.ok(validateArea({ type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] } }));
});

test('coordinate entry produces a closed geodesic polygon in longitude/latitude order', () => {
  const area = radiusArea(35.759, -5.802, 25);
  assert.equal(validateArea(area), null); assert.equal(area.geometry.coordinates[0].length, 65);
  assert.deepEqual(area.properties.center, [-5.802, 35.759]);
  const contains = areaPredicate(area);
  assert.equal(contains([-5.802, 35.759]), true); assert.equal(contains([-5.802, 36.759]), false);
  const [[west, south], [east, north]] = areaBounds(area);
  assert.ok(west < -5.8 && east > -5.8 && south < 35.76 && north > 35.76);
});

test('invalid coordinate/radius input and date-line wrapping fail explicitly', () => {
  for (const args of [[91, 0, 25], [0, 181, 25], [0, 0, 0], [0, 0, -2], [NaN, 0, 25], [0, 0, 1001]]) assert.throws(() => radiusArea(...args));
  assert.throws(() => radiusArea(0, 179.99, 25), /date line/);
  assert.equal(areaPredicate(null)([150, -60]), true);
});

test('radius selections can be restored and edited by Terra Draw at the map adapter precision', () => {
  const adapter = { project: (lng, lat) => ({ x: lng, y: lat }), unproject: (x, y) => ({ lng: x, lat: y }), setCursor() {}, getLngLatFromEvent() {}, setDoubleClickToZoom() {}, getMapEventElement() {}, register() {}, unregister() {}, render() {}, clear() {}, getCoordinatePrecision: () => 7 };
  const draw = new TerraDraw({ adapter, modes: [new TerraDrawPolygonMode(), new TerraDrawSelectMode({ flags: { polygon: { feature: { draggable: true } } } })] });
  draw.start();
  const area = radiusArea(35.759, -5.802, 25);
  const id = crypto.randomUUID();
  const result = draw.addFeatures([{ ...area, id, properties: { ...area.properties, mode: 'polygon' } }]);
  assert.equal(result[0].valid, true, result[0].reason);
  draw.setMode('select'); draw.selectFeature(id);
  assert.ok(draw.getSnapshotFeature(id));
  draw.stop();
});

test('the real polygon mode can commit its early corners and finish a validated triangle', () => {
  let handlers;
  const adapter = { project: (lng, lat) => ({ x: lng * 100, y: lat * 100 }), unproject: (x, y) => ({ lng: x / 100, lat: y / 100 }), setCursor() {}, getLngLatFromEvent() {}, setDoubleClickToZoom() {}, getMapEventElement() {}, register(callbacks) { handlers = callbacks; }, unregister() {}, render() {}, clear() {}, getCoordinatePrecision: () => 7 };
  const draw = new TerraDraw({ adapter, modes: [new TerraDrawPolygonMode({ validation: validateDrawingArea })] });
  let finished;
  draw.on('finish', id => { finished = draw.getSnapshotFeature(id); });
  draw.start(); draw.setMode('polygon');
  for (const [lng, lat] of [[0, 0], [2, 0], [1, 2], [0, 0]]) {
    const event = { lng, lat, containerX: lng * 100, containerY: lat * 100, button: 'left', heldKeys: [], isContextMenu: false };
    handlers.onMouseMove(event); handlers.onClick(event);
  }
  assert.ok(finished, 'The sketch must finish instead of rejecting its incomplete early corners.');
  assert.equal(validateArea(finished), null);
  assert.equal(finished.geometry.coordinates[0].length, 4);
  draw.stop();
});
