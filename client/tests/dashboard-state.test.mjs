import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dashboardReducer, initialDashboardState } from '../src/dashboard-state.ts';
import { DatasetRequests, loadObservations, ObservationRateLimitError, parseCollection, uploadObservations, validateUpload } from '../src/fire-api.ts';

test('observation rate limiting reports the server cooldown', async () => {
  const start = Date.now();
  await assert.rejects(
    loadObservations('', new AbortController().signal, async () => new Response(null, { status: 429, headers: { 'Retry-After': '120' } })),
    error => error instanceof ObservationRateLimitError && error.retryAt >= start + 120_000 && error.retryAt <= Date.now() + 120_000,
  );
});
import { dashboardPage, navigateDashboard } from '../src/dashboard-navigation.ts';
import { simulatedHistory } from '../src/historical-demo.ts';
import { collection, feature, polygon } from './analytics-fixtures.mjs';

test('dataset replacement clears focused dates, resets date bounds/sensor, and keeps the chosen area/metric', () => {
  let state = initialDashboardState(collection([feature('2025-01-01')]));
  const area = polygon([[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]);
  state = dashboardReducer(state, { type: 'filters', patch: { area, metric: 'mean-frp', selectedDay: '2025-01-01' } });
  state = dashboardReducer(state, { type: 'loaded', collection: collection([feature('2024-02-29', 20, 'VIIRS')], { source: 'csv', uploaded: true }), remember: true });
  assert.equal(state.filters.area, area); assert.equal(state.filters.metric, 'mean-frp');
  assert.equal(state.filters.selectedDay, null); assert.equal(state.filters.sensor, 'VIIRS');
  assert.equal(state.filters.startDate, '2024-02-29'); assert.equal(state.collection.metadata.uploaded, true);
});

test('date changes clear a day outside the range; invalid dates and geometry retain valid filters', () => {
  let state = initialDashboardState(collection());
  state = dashboardReducer(state, { type: 'filters', patch: { selectedDay: '2025-05-01' } });
  assert.equal(state.filters.selectedDay, '2025-05-01');
  const next = dashboardReducer(state, { type: 'filters', patch: { startDate: '2025-06-01' } });
  assert.equal(next.filters.selectedDay, null);
  assert.equal(dashboardReducer(next, { type: 'filters', patch: { startDate: 'bad' } }), next);
  assert.equal(dashboardReducer(next, { type: 'filters', patch: { area: polygon([[0, 0], [1, 0], [2, 0], [0, 0]]) } }), next);
});

test('an explicitly covered zero-detection dataset defaults to its supported sensor', () => {
  const state = initialDashboardState(collection([], { source: 'simulated', coverage_scope: 'global', coverage: [{ sensor: 'VIIRS', startDate: '2025-01-01', endDate: '2025-12-31', status: 'complete', method: 'simulated-viirs-v1' }] }));
  assert.equal(state.filters.sensor, 'VIIRS');
  assert.equal(state.filters.startDate, '2025-01-01');
});

test('simulation switching retains the previously uploaded dataset for restoration', () => {
  const upload = collection([feature('2025-03-01')], { source: 'csv', uploaded: true });
  let state = dashboardReducer(initialDashboardState(collection()), { type: 'loaded', collection: upload, remember: true });
  state = dashboardReducer(state, { type: 'loaded', collection: simulatedHistory(), remember: false });
  assert.equal(state.collection.metadata.source, 'simulated');
  state = dashboardReducer(state, { type: 'return-loaded' });
  assert.equal(state.collection, upload);
});

test('a late server response cannot replace a newer upload; cancellation aborts previous requests', async () => {
  const requests = new DatasetRequests();
  let resolveServer;
  const first = requests.begin();
  const server = loadObservations('', first.controller.signal, () => new Promise(resolve => { resolveServer = resolve; }));
  const second = requests.begin();
  assert.equal(first.controller.signal.aborted, true);
  let active = collection([feature('2025-04-01')], { source: 'csv', uploaded: true });
  resolveServer(new Response(JSON.stringify(collection([feature('2021-01-01')]))));
  const response = await server;
  if (requests.current(first.revision)) active = response;
  assert.equal(active.metadata.uploaded, true); assert.equal(requests.current(second.revision), true);
});

test('API adapters accept empty collections, enforce geometry, and retain actionable upload errors', async () => {
  assert.equal(parseCollection(collection([])).features.length, 0);
  assert.throws(() => parseCollection({ type: 'FeatureCollection', features: [{ geometry: { type: 'Point', coordinates: [999, 0] } }] }), /invalid/);
  assert.match(validateUpload({ name: 'test.txt', size: 10 }), /csv/);
  assert.match(validateUpload({ name: 'test.csv', size: 0 }), /empty/);
  assert.match(validateUpload({ name: 'test.csv', size: 4 * 1024 * 1024 }), /3 MB/);
  const file = new File(['test'], 'test.csv', { type: 'text/csv' });
  await assert.rejects(uploadObservations('', file, new AbortController().signal, async () => new Response(JSON.stringify({ error: 'Missing CSV column: frp' }), { status: 400 })), /Missing CSV column/);
  await assert.rejects(loadObservations('', new AbortController().signal, async () => new Response('', { status: 503 })), /503/);
});

test('dashboard navigation changes route without reloading or recreating uploaded state', () => {
  const upload = collection([feature('2025-03-01')], { source: 'csv', uploaded: true });
  const state = dashboardReducer(initialDashboardState(collection()), { type: 'loaded', collection: upload, remember: true });
  const originalWindow = globalThis.window, originalEvent = globalThis.PopStateEvent;
  const events = [], paths = [];
  globalThis.window = { location: { pathname: '/' }, history: { pushState: (_, __, href) => paths.push(href) }, dispatchEvent: event => events.push(event.type) };
  globalThis.PopStateEvent = Event;
  let prevented = false;
  try {
    navigateDashboard({ button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, preventDefault() { prevented = true; } }, '/analytics/');
    assert.equal(prevented, true); assert.deepEqual(paths, ['/analytics/']); assert.deepEqual(events, ['popstate']);
    assert.equal(state.collection, upload); assert.equal(dashboardPage('/analytics/'), 'analytics'); assert.equal(dashboardPage('/'), 'explorer');
  } finally { globalThis.window = originalWindow; globalThis.PopStateEvent = originalEvent; }
});

test('historical demo is deterministic, labeled, dated, and contains missing FRP and explicit coverage gaps', () => {
  const demo = simulatedHistory();
  assert.equal(simulatedHistory(), demo); assert.equal(demo.metadata.source, 'simulated');
  assert.ok(demo.features.length > 1000 && demo.features.length < 50000);
  assert.ok(demo.features.some(f => f.properties.raw_frp === null));
  assert.ok(demo.metadata.coverage.some(i => i.status === 'unavailable'));
  assert.equal(new Set(demo.features.map(f => f.properties.satellite)).size, 3);
  assert.ok(demo.features.every(f => f.properties.observed_at_utc >= '2021-01-01' && f.properties.observed_at_utc < '2026-01-01'));
});
