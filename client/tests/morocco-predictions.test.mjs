import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { predictionCells, predictionDates, preferredPredictionDate } from '../src/morocco-predictions.ts';

const data = JSON.parse(readFileSync(new URL('../public/data/morocco-predictions.json', import.meta.url), 'utf8'));

test('nationwide predictions cover all 24 months and use prior-year data only', () => {
  const months = predictionDates(data);
  assert.equal(months.length, 24);
  assert.equal(months[0], '2026-12-01');
  assert.equal(months.at(-1), '2025-01-01');
  assert.deepEqual(data.evaluation.training_end_by_year, { 2025: 2024, 2026: 2025 });
  assert.notDeepEqual(data.monthly['2026-07-01'], data.monthly['2025-07-01']);
  assert.equal(preferredPredictionDate(months, '2026-11-01'), '2026-11-01');
  const { features } = predictionCells(data, months[0]);
  assert.ok(features.length > 6000);
  assert.ok(features.some(({ geometry }) => geometry.coordinates[0][0][0][1] < 27));
  assert.ok(features.some(({ geometry }) => geometry.coordinates[0][0][0][1] > 35));
  for (const month of months) {
    assert.equal(data.monthly[month].length, features.length);
    assert.ok(Math.abs(data.monthly[month].reduce((sum, n) => sum + n, 0) / 1_000_000 - 1) < 0.005);
  }
});
