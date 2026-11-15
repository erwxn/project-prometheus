const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { adaptHarmonized } = require('./harmonized-data');
const { feedConfig, createHarmonizedFeed } = require('./harmonized-feed');
const csv = fs.readFileSync(path.join(__dirname, 'fixtures/harmonized.csv'));
const config = () => feedConfig({ HARMONIZED_SOURCE: 'https://example.org/results.csv' });

test('CSV preserves estimated values, zero FRP, UTC and solar rollover without fabricating sensor measurements', async () => {
  const data = await adaptHarmonized(csv);
  assert.equal(data.features.length, 2);
  assert.equal(data.features[0].properties.normalized_frp, 185.2);
  assert.equal(data.features[0].properties.raw_frp, null);
  assert.equal(data.features[1].properties.normalized_frp, 0);
  assert.equal(data.features[0].properties.model_version, 'illustrative-only');
  assert.equal(data.features[0].properties.observed_at_utc, '2026-11-14T13:30:00.000Z');
  assert.equal(data.features[0].properties.confidence_percent, undefined);
});

test('JSON API envelopes and custom columns use the same adapter', async () => {
  const record = { y: 10, x: 180, time: '2026-11-14T23:00:00Z', prediction: 12 };
  const data = await adaptHarmonized(Buffer.from(JSON.stringify({ results: [record] })), {
    format: 'json', jsonPath: 'results', columns: { latitude: 'y', longitude: 'x', observed_at_utc: 'time', harmonized_frp_mw: 'prediction' },
  });
  assert.equal(data.features[0].properties.local_solar_date, '2026-11-15');
  assert.equal(data.features[0].properties.normalized_frp, 12);
});

test('invalid and duplicate records reject the entire snapshot', async () => {
  for (const invalid of [csv.toString().replace('35.7', '91'), csv.toString().replace('185.2', ''),
    csv.toString().replace('2026-11-14T13:30:00Z', '2026-02-30T13:30:00Z'),
    csv.toString().replace('2026-11-14T13:30:00Z', '2026-11-14T13:30:00'),
    csv.toString().replace('illustrative-2', 'illustrative-1')]) {
    await assert.rejects(adaptHarmonized(Buffer.from(invalid)));
  }
  await assert.rejects(adaptHarmonized(csv, { maxRows: 1 }));
  await assert.rejects(adaptHarmonized(Buffer.from('latitude,latitude\n1,1')));
});

test('Snappy Parquet supports typed timestamps and enforces row limits before decoding', async () => {
  const { parquetWriteBuffer } = await import('hyparquet-writer');
  const buffer = Buffer.from(parquetWriteBuffer({ columnData: [
    { name: 'latitude', data: [35.7], type: 'DOUBLE' },
    { name: 'longitude', data: [-5.8], type: 'DOUBLE' },
    { name: 'observed_at_utc', data: [new Date('2026-11-14T13:30:00Z')], type: 'TIMESTAMP' },
    { name: 'harmonized_frp_mw', data: [185.2], type: 'DOUBLE' },
  ] }));
  const data = await adaptHarmonized(buffer, { format: 'parquet' });
  assert.equal(data.features[0].properties.normalized_frp, 185.2);
  assert.equal(data.features[0].properties.observed_at_utc, '2026-11-14T13:30:00.000Z');
  await assert.rejects(adaptHarmonized(buffer, { format: 'parquet', maxRows: 0 }), /limit/);
});

test('refresh is shared, conditional, and retains last valid snapshot after invalid updates', async () => {
  let time = 0, calls = 0, behavior = 'valid';
  const feed = createHarmonizedFeed(config(), { now: () => time, fetchImpl: async (_, options) => {
    calls++;
    if (behavior === 'unchanged') { assert.equal(options.headers['If-None-Match'], 'first'); return new Response(null, { status: 304 }); }
    return new Response(behavior === 'invalid' ? 'bad file' : behavior === 'updated' ? csv.toString().replace('185.2', '222.2') : csv, { headers: { etag: 'first' } });
  } });
  const [first, concurrent] = await Promise.all([feed.get(), feed.get()]);
  assert.equal(calls, 1);
  assert.equal(first.metadata.version, concurrent.metadata.version);
  behavior = 'unchanged'; time += 60001;
  assert.equal((await feed.get()).metadata.feed_status, 'current');
  behavior = 'invalid'; time += 60001;
  const stale = await feed.get();
  assert.equal(stale.metadata.feed_status, 'stale');
  assert.deepEqual(stale.features, first.features);
  behavior = 'valid'; time += 60001;
  assert.equal((await feed.get()).metadata.feed_status, 'current');
  behavior = 'updated'; time += 60001;
  const updated = await feed.get();
  assert.notEqual(updated.metadata.version, first.metadata.version);
  assert.equal(updated.features[0].properties.normalized_frp, 222.2);
});

test('cold failures never serve demos; byte limits and timeouts are enforced', async () => {
  const failed = createHarmonizedFeed(config(), { fetchImpl: async () => new Response('secret upstream detail', { status: 401 }) });
  await assert.rejects(failed.get(), /no validated snapshot/);
  const limited = createHarmonizedFeed({ ...config(), maxBytes: 4 }, { fetchImpl: async () => new Response(csv) });
  await assert.rejects(limited.get());
  const hanging = createHarmonizedFeed({ ...config(), timeout: 10 }, { fetchImpl: (_, options) => new Promise((_, reject) => options.signal.addEventListener('abort', () => reject(new Error('timeout')))) });
  await assert.rejects(hanging.get());
});

test('GCS uses server credentials and encodes object paths; API tokens remain server-side', async () => {
  const cfg = feedConfig({ HARMONIZED_SOURCE: 'gs://team-data/published/latest results.csv' });
  const feed = createHarmonizedFeed(cfg, { getAccessToken: async () => 'test-only-token', fetchImpl: async (url, options) => {
    assert.equal(url, 'https://storage.googleapis.com/storage/v1/b/team-data/o/published%2Flatest%20results.csv?alt=media');
    assert.equal(options.headers.Authorization, 'Bearer test-only-token');
    assert.equal(options.redirect, 'error');
    return new Response(csv);
  } });
  const data = await feed.get();
  assert.equal(JSON.stringify(data).includes('test-only-token'), false);
  assert.equal(JSON.stringify(data).includes('gs://'), false);
  const api = createHarmonizedFeed({ ...config(), token: 'test-only-token' }, { fetchImpl: async (_, options) => {
    assert.equal(options.headers.Authorization, 'Bearer test-only-token'); return new Response(csv);
  } });
  await api.get();
  const stuckAuth = createHarmonizedFeed({ ...cfg, timeout: 10 }, { getAccessToken: () => new Promise(() => {}) });
  await assert.rejects(stuckAuth.get(), /no validated snapshot/);
});

test('configuration rejects unsupported transports and invalid intervals', () => {
  assert.equal(feedConfig({}), null);
  for (const env of [{ HARMONIZED_SOURCE: 'file:///tmp/data.csv' }, { HARMONIZED_SOURCE: 'http://public.example/results.csv' },
    { HARMONIZED_SOURCE: 'gs://bucket' }, { HARMONIZED_SOURCE: 'https://example.org/x.csv', HARMONIZED_REFRESH_SECONDS: 'NaN' }]) {
    assert.throws(() => feedConfig(env));
  }
});

test('empty published snapshots remain valid and clear old observations', async () => {
  const csvEmpty = await adaptHarmonized(Buffer.from(csv.toString().split('\n')[0]));
  assert.deepEqual(csvEmpty.features, []);
  assert.equal(csvEmpty.metadata.observed_from, null);
  assert.deepEqual((await adaptHarmonized(Buffer.from('[]'), { format: 'json' })).features, []);
});

test('real HTTP routes share the harmonized snapshot, keep samples/uploads isolated, and return 503 on cold failure', async () => {
  const http = require('node:http');
  let body = csv;
  const upstream = http.createServer((req, res) => res.end(body));
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
  const previous = process.env.HARMONIZED_SOURCE;
  process.env.HARMONIZED_SOURCE = `http://127.0.0.1:${upstream.address().port}/results.csv`;
  const servers = [];
  try {
    const startApp = async () => {
      delete require.cache[require.resolve('./index')];
      const server = require('./index').listen(0, '127.0.0.1');
      servers.push(server);
      await new Promise(resolve => server.once('listening', resolve));
      return `http://127.0.0.1:${server.address().port}`;
    };
    const base = await startApp();
    const response = await fetch(`${base}/api/v1/fires`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const data = await response.json();
    assert.equal(data.metadata.source, 'harmonized');
    assert.equal(data.features.length, 1);
    assert.equal(data.metadata.country_iso3, "MAR");
    const diurnal = await (await fetch(`${base}/api/v1/fires/diurnal?hour=13`)).json();
    assert.equal(diurnal.features.length, 1);
    assert.equal(diurnal.features[0].properties.normalized_frp, 185.2);
    const sample = await (await fetch(`${base}/api/v1/fires/sample`)).json();
    assert.equal(sample.features.length, 0);
    const uploaded = await fetch(`${base}/api/v1/fires/upload`, { method: 'POST', headers: { 'Content-Type': 'text/csv' },
      body: 'latitude,longitude,acq_date,acq_time,satellite,confidence,frp\n35.7,-5.8,2026-11-14,1330,T,90,44.2\n' });
    assert.equal(uploaded.status, 200);
    assert.deepEqual((await (await fetch(`${base}/api/v1/fires`)).json()).features, data.features);
    body = Buffer.from('invalid');
    const cold = await startApp();
    const failed = await fetch(`${cold}/api/v1/fires`);
    assert.equal(failed.status, 503);
    assert.equal((await failed.json()).source, 'harmonized');
  } finally {
    if (previous === undefined) delete process.env.HARMONIZED_SOURCE; else process.env.HARMONIZED_SOURCE = previous;
    await Promise.all([...servers, upstream].map(server => new Promise(resolve => server.close(resolve))));
  }
});
