import { test } from 'node:test';
import assert from 'node:assert/strict';
import { comparisonMonth } from '../src/season-comparison.ts';

test('comparison selects a complete UTC month across leap days and year boundaries', () => {
  assert.deepEqual(comparisonMonth('2024-02-18'), {
    startDate: '2024-02-01', endDate: '2024-02-29',
  });
  assert.deepEqual(comparisonMonth('2023-12-31'), {
    startDate: '2023-12-01', endDate: '2023-12-31',
  });
  assert.equal(comparisonMonth(''), null);
});
