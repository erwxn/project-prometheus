import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activityDay, anomalies, dailyBuckets, datasetDateBounds, dateRangeError, enumerateDates, historicalTrends, prepareObservations, selectRange, selectScope, summarizeRange, validDate } from '../src/analytics-engine.ts';
import { feature, filters, metadata, collection, polygon } from './analytics-fixtures.mjs';

test('UTC dates validate leap days, reject normalized invalid dates, and include both date endpoints', () => {
  assert.equal(validDate('2024-02-29'), true);
  assert.equal(validDate('2025-02-29'), false);
  assert.equal(validDate('2025-02-31'), false);
  assert.match(dateRangeError('2025-02-02', '2025-02-01'), /start date/);
  assert.deepEqual(enumerateDates('2024-02-28', '2024-03-01'), ['2024-02-28', '2024-02-29', '2024-03-01']);
  const rows = prepareObservations([feature('2025-01-01'), feature('2025-01-31'), feature('2025-02-01')]);
  assert.equal(selectRange(rows, filters({ endDate: '2025-01-31' })).length, 2);
});

test('geographic and sensor filters apply together before date aggregation', () => {
  const rows = prepareObservations([feature('2025-01-01', 10, 'MODIS', [1, 1]), feature('2025-01-01', 20, 'VIIRS', [1, 1]), feature('2025-01-01', 30, 'MODIS', [5, 5])]);
  const area = polygon([[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]);
  assert.equal(selectScope(rows, filters({ area })).length, 1);
  assert.equal(selectScope(rows, filters({ area, sensor: 'VIIRS' }))[0].frp, 20);
});

test('date preparation preserves original UTC boundaries and excludes unusable dates from dated queries', () => {
  const late = feature('2025-01-01'); late.properties.observed_at_utc = '2025-01-01T23:59:59.999Z';
  const rows = prepareObservations([late, feature('2025-01-02'), feature(undefined), feature('2025-02-31')]);
  assert.equal(selectRange(rows, filters({ startDate: '2025-01-01', endDate: '2025-01-01' })).length, 1);
  assert.equal(rows[2].date, null);
  assert.equal(rows[3].date, null);
  assert.deepEqual(datasetDateBounds(collection([late], { source: 'csv' })), ['2025-01-01', '2025-01-01']);
});

test('known zero, unknown coverage, unavailable data, and observed partial days remain distinct', () => {
  const index = dailyBuckets(prepareObservations([feature('2025-01-02')]));
  assert.equal(activityDay('2025-01-01', index, metadata, 'MODIS', 'detections').value, 0);
  const unknown = activityDay('2025-01-01', index, { source: 'csv', observed_from: '2025-01-01', observed_to: '2025-01-31' }, 'MODIS', 'detections');
  assert.equal(unknown.value, null); assert.equal(unknown.availability, 'unknown');
  assert.equal(activityDay('2025-01-02', index, { source: 'csv' }, 'MODIS', 'detections').availability, 'partial');
  const gap = { ...metadata, coverage: [...metadata.coverage, { ...metadata.coverage[0], startDate: '2025-01-03', endDate: '2025-01-03', status: 'unavailable' }] };
  assert.equal(activityDay('2025-01-03', index, gap, 'MODIS', 'detections').availability, 'unavailable');
  assert.equal(activityDay('2025-01-03', index, gap, 'MODIS', 'detections').value, null);
});

test('FRP averages include zero, exclude missing/invalid values, and weight observations rather than daily means', () => {
  const rows = prepareObservations([feature('2025-01-01', 0), feature('2025-01-01', 100), feature('2025-01-02', 50), feature('2025-01-02', null), feature('2025-01-02', -1)]);
  const index = dailyBuckets(rows), f = filters({ metric: 'mean-frp' });
  const summary = summarizeRange(rows, f, index, metadata);
  assert.equal(summary.count, 5); assert.equal(summary.frpCount, 3); assert.equal(summary.meanFrp, 50); assert.equal(summary.maxFrp, 100);
  assert.equal(summary.activeDays, 2);
  assert.equal(historicalTrends(index, metadata, f, 'month')[0].value, 50);
});

test('peak activity reports tied days and changes with the activity metric', () => {
  const rows = prepareObservations([feature('2025-01-01', 5), feature('2025-01-01', 5), feature('2025-01-02', 80), feature('2025-01-02', 80)]);
  const index = dailyBuckets(rows);
  assert.deepEqual(summarizeRange(rows, filters(), index, metadata).peakDays, ['2025-01-01', '2025-01-02']);
  assert.deepEqual(summarizeRange(rows, filters({ metric: 'mean-frp' }), index, metadata).peakDays, ['2025-01-02']);
  assert.equal(summarizeRange(prepareObservations([feature(undefined)]), filters({ startDate: '', endDate: '' }), new Map(), { source: 'demo' }).activeDays, null);
});

function historyRows() { return prepareObservations([2022, 2023, 2024, 2025].flatMap((year, i) => Array.from({ length: i + 1 }, () => feature(`${year}-01-10`)))); }
test('historical baselines use exactly the preceding three complete same-method years', () => {
  const index = dailyBuckets(historyRows());
  const points = historicalTrends(index, metadata, filters(), 'month');
  assert.equal(points[0].value, 4); assert.equal(points[0].baseline, 2);
  assert.equal(points[0].absoluteAnomaly, 2); assert.equal(points[0].percentageAnomaly, 100);
  assert.equal(historicalTrends(index, metadata, filters(), 'year')[0].baseline, 2);
  assert.deepEqual(historicalTrends(index, metadata, filters({ selectedDay: '2025-01-01' }), 'month'), points);
});

test('a reference-year coverage gap, product change, or partial selected period suppresses anomalies', () => {
  const index = dailyBuckets(historyRows());
  const gap = { ...metadata, coverage: [...metadata.coverage, { ...metadata.coverage[0], startDate: '2023-07-01', endDate: '2023-07-01', status: 'unavailable' }] };
  assert.equal(historicalTrends(index, gap, filters(), 'month')[0].baseline, null);
  const changed = { ...metadata, coverage: [{ ...metadata.coverage[0], endDate: '2023-12-31' }, { ...metadata.coverage[0], startDate: '2024-01-01', method: 'test-modis-v2' }] };
  assert.equal(historicalTrends(index, changed, filters(), 'month')[0].baseline, null);
  assert.equal(historicalTrends(index, metadata, filters({ endDate: '2025-01-15' }), 'month')[0].baseline, null);
  assert.equal(historicalTrends(index, { source: 'csv' }, filters(), 'month')[0].baseline, null);
  assert.deepEqual(historicalTrends(index, metadata, filters({ sensor: 'ALL' }), 'month'), []);
});

test('missing and zero baselines never fabricate percentage anomalies', () => {
  assert.deepEqual(anomalies(5, 0), { absoluteAnomaly: 5, percentageAnomaly: null });
  assert.deepEqual(anomalies(0, 0), { absoluteAnomaly: 0, percentageAnomaly: null });
  assert.deepEqual(anomalies(5, null), { absoluteAnomaly: null, percentageAnomaly: null });
  assert.equal(anomalies(5, 10).percentageAnomaly, -50);
  assert.equal(anomalies(null, 10).absoluteAnomaly, null);
});

test('observations contradicting the declared harmonization/product method suppress baseline comparisons', () => {
  const rows = historyRows();
  rows.find(row => row.date === '2023-01-10').feature.properties.method_id = 'different-method';
  const points = historicalTrends(dailyBuckets(rows), metadata, filters(), 'month');
  assert.equal(points[0].baseline, null);
});

test('raw sensors use measured FRP while explicit harmonized records use stored estimates', () => {
  const raw = feature('2025-01-01', 10); raw.properties.normalized_frp = 100;
  const harmonized = feature('2025-01-01', 10, 'Harmonized'); harmonized.properties.normalized_frp = 80;
  assert.deepEqual(prepareObservations([raw, harmonized]).map(row => row.frp), [10, 80]);
});
