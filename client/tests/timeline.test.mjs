import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DAY, MINUTE, observationTime, defaultWindowStart, fileWindow, matchesDataset, matchesTime, nextDetectionMinute } from '../src/timeline.ts';
const feature = (utc, solar = '13:30', date = '2026-11-09', satellite = 'MODIS') => ({ properties: { observed_at_utc: utc, acq_time_utc: utc?.slice(11, 16) || '10:30', local_solar_time: solar, local_solar_date: date, satellite } });
const start = Date.parse('2026-11-08T23:27:00Z');
test('UTC uses the original timestamp, not the solar clock or host timezone', () => {
  const row = feature('2026-11-09T00:05:00Z', '20:05', '2026-11-08');
  assert.equal(observationTime(row, 'utc'), Date.parse('2026-11-09T00:05:00Z'));
  assert.equal(observationTime(row, 'solar'), Date.parse('2026-11-08T20:05:00Z'));
});
test('default UTC window is exactly 24h ending after latest observation, not all imported dates', () => {
  const rows = [feature('2026-11-08T00:24:00Z'), feature('2026-11-09T23:26:00Z')];
  assert.equal(defaultWindowStart(rows, 'utc'), start);
  assert.equal(matchesTime(observationTime(rows[0], 'utc'), start, 1440, true), false);
  assert.equal(matchesTime(observationTime(rows[1], 'utc'), start, 1440, true), true);
});
test('full window includes start but excludes end and future dates', () => {
  assert.equal(matchesTime(start, start, 0, true), true);
  assert.equal(matchesTime(start + DAY - 1, start, 0, true), true);
  assert.equal(matchesTime(start + DAY, start, 0, true), false);
});
test('rolling interval crosses UTC midnight and excludes observations after cursor', () => {
  assert.equal(matchesTime(start + 30 * MINUTE, start, 60, false), true);
  assert.equal(matchesTime(start + 60 * MINUTE, start, 60, false), false);
  assert.equal(matchesTime(start + 10 * MINUTE, start, 90, false), false);
  assert.equal(matchesTime(start + 30 * MINUTE, start, 90, false), true);
  assert.equal(matchesTime(start, start, 0, false), false);
});
test('next detection skips gaps, includes exact step boundaries and wraps within selected window', () => {
  const times = [start + 15 * MINUTE, start + 500 * MINUTE, start + DAY];
  assert.equal(nextDetectionMinute(times, start, 0), 30);
  assert.equal(nextDetectionMinute(times, start, 30), 510);
  assert.equal(nextDetectionMinute(times, start, 1440), 30);
  assert.equal(nextDetectionMinute([start - 1, start + DAY, NaN], start, 0), null);
});
test('dataset filtering applies before next-detection search and missing sensors remain empty', () => {
  const row = feature('2026-11-09T00:05:00Z');
  assert.equal(matchesDataset(row, 'MODIS'), true);
  assert.equal(matchesDataset(row, 'VIIRS'), false);
  assert.equal(matchesDataset(row, 'Harmonized'), false);
  assert.equal(matchesDataset(row, 'ALL'), true);
});
test('undated demos remain relative clock data without claiming real acquisition dates', () => {
  const row = feature(undefined, '13:30', undefined);
  assert.equal(defaultWindowStart([row], 'utc'), 0);
  assert.equal(observationTime(row, 'utc'), (10 * 60 + 30) * MINUTE);
});

test('entire-file bounds include first and last observations across multiple days', () => {
  const rows = [feature('2026-11-08T00:24:00Z'), feature('2026-11-09T23:26:00Z')];
  const bounds = fileWindow(rows, 'utc');
  assert.equal(bounds.start, Date.parse('2026-11-08T00:24:00Z'));
  assert.equal(bounds.durationMinutes, 2823);
  for (const row of rows) assert.equal(matchesTime(observationTime(row, 'utc'), bounds.start, 0, true, bounds.durationMinutes), true);
  assert.equal(matchesTime(bounds.start + bounds.durationMinutes * MINUTE, bounds.start, 0, true, bounds.durationMinutes), false);
});
test('entire-file playback and next detection reach beyond the first 24h and handle a partial final step', () => {
  const last = start + 2822 * MINUTE;
  assert.equal(matchesTime(last, start, 2823, false, 2823), true);
  assert.equal(nextDetectionMinute([start, last], start, 1440, 2823), 2823);
  assert.equal(nextDetectionMinute([start, last], start, 2823, 2823), 15);
});
test('a one-observation file remains visible with a one-minute timeline', () => {
  const rows = [feature('2026-11-09T13:30:00Z')];
  const bounds = fileWindow(rows, 'utc');
  assert.equal(bounds.durationMinutes, 1);
  assert.equal(matchesTime(bounds.start, bounds.start, 1, true, 1), true);
  assert.equal(nextDetectionMinute([bounds.start], bounds.start, 0, 1), 1);
});

test('linear next-detection search handles unsorted duplicate timestamps and invalid values', () => {
  const times = [start + 300 * MINUTE, NaN, start + 10 * MINUTE, start + 300 * MINUTE, start - 1];
  assert.equal(nextDetectionMinute(times, start, 0), 15);
  assert.equal(nextDetectionMinute(times, start, 15), 315);
  assert.equal(nextDetectionMinute(times, start, 1440), 15);
});
