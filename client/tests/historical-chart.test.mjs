import assert from 'node:assert/strict';
import test from 'node:test';
import { alignedKeys, chartTitle, historicalLabel, historicalValue, periodKeys, valuesForYear } from '../src/historical-chart.ts';

test('daily, monthly, and yearly keys use inclusive UTC calendar boundaries', () => {
  assert.deepEqual(periodKeys('2020-02-28', '2020-03-01', 'daily'), ['2020-02-28', '2020-02-29', '2020-03-01']);
  assert.deepEqual(periodKeys('2020-01-31', '2020-03-01', 'monthly'), ['2020-01', '2020-02', '2020-03']);
  assert.deepEqual(periodKeys('2019-12-31', '2021-01-01', 'yearly'), ['2019', '2020', '2021']);
});

test('daily comparison includes leap day and leaves it missing for a non-leap year', () => {
  const keys = alignedKeys('2020-01-01', '2020-12-31', 'daily');
  assert.equal(keys.length, 366);
  assert.ok(keys.includes('02-29'));
  const values = valuesForYear([{ date: '2021-02-28', count: 4, frpSum: 20, frpCount: 2 }], 2021, ['02-28', '02-29', '03-01'], 'detections');
  assert.deepEqual(values, [4, null, null]);
});

test('missing buckets are gaps rather than zero and FRP uses valid sample weighting', () => {
  assert.equal(historicalValue(undefined, 'detections'), null);
  assert.equal(historicalValue({ date: '2026-01', count: 0, frpSum: 0, frpCount: 0 }, 'detections'), 0);
  assert.equal(historicalValue({ date: '2026-01', count: 3, frpSum: 45, frpCount: 2 }, 'mean-frp'), 22.5);
});

test('labels and titles reflect the selected real aggregation', () => {
  assert.equal(chartTitle('daily', 'detections'), 'Daily Fire Detections');
  assert.equal(chartTitle('monthly', 'detections'), 'Monthly Fire Detections');
  assert.equal(chartTitle('yearly', 'detections'), 'Yearly Fire Detections');
  assert.match(historicalLabel('2026-01', 'monthly'), /Jan/);
});
