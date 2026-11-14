import { test } from 'node:test';
import assert from 'node:assert/strict';
import { observationPage } from '../src/observation-list.ts';

test('every observation in a realistic multi-day import is reachable exactly once', () => {
  const records = Array.from({ length: 21518 }, (_, id) => ({ id }));
  const visited = [];
  for (let page = 0; page < Math.ceil(records.length / 20); page++) {
    visited.push(...observationPage(records, page).rows);
  }
  assert.deepEqual(visited, records);
  assert.equal(records[0].id, 0);
  assert.equal(observationPage(records, 1075).rows.length, 18);
});

test('a shrinking filter cannot leave pagination on an empty page', () => {
  assert.deepEqual(observationPage(['a', 'b'], 50), { page: 0, start: 0, rows: ['a', 'b'] });
  assert.deepEqual(observationPage([], 3), { page: 0, start: 0, rows: [] });
  assert.deepEqual(observationPage(['a'], -1).rows, ['a']);
});
