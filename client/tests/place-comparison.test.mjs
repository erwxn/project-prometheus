import assert from 'node:assert/strict';
import { test } from 'node:test';
import { boundaryAreaKm2, compareMonths } from '../src/place-comparison.ts';

test('comparison separates unknown activity from covered zero and partial records', () => {
  const result = compareMonths(['2024-01-31', '2024-02-01', '2024-03-01', '2024-03-02'], new Map([['2024-03-01', 2]]), new Set(['2024-02-01', '2024-03-01']));
  assert.deepEqual([...result.months], [
    ['2024-01', { count: null, complete: false }],
    ['2024-02', { count: 0, complete: true }],
    ['2024-03', { count: 2, complete: false }],
  ]);
  assert.equal(result.covered, 2);
});

test('area sums islands, subtracts holes, and treats the date line as a short edge', () => {
  const ring = [[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]];
  const hole = [[0.5, 0.5], [1, 0.5], [1, 1], [0.5, 1], [0.5, 0.5]];
  const dateLine = [[179, 0], [-179, 0], [-179, 2], [179, 2], [179, 0]];
  const polygon = (...coordinates) => boundaryAreaKm2({ type: 'Polygon', coordinates });
  assert.ok(polygon(ring) > 49_000 && polygon(ring) < 50_000);
  assert.equal(polygon(ring), polygon(dateLine));
  assert.equal(polygon(ring, hole), polygon(ring) - polygon(hole));
  assert.equal(boundaryAreaKm2({ type: 'MultiPolygon', coordinates: [[ring, hole], [dateLine]] }), polygon(ring, hole) + polygon(dateLine));
});
