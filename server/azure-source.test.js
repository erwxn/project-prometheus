const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { feedConfig, createHarmonizedFeed } = require('./harmonized-feed');
const { azureSource } = require('./azure-source');
const location = { AZURE_STORAGE_ACCOUNT: 'stprometheusnasa', AZURE_GOLD_CONTAINER: 'gold', AZURE_BLOB_ENDPOINT: 'https://stprometheusnasa.blob.core.windows.net' };

test('account details alone preserve the existing source until an exact publication is configured', () => {
  assert.equal(feedConfig(location), null);
  assert.equal(feedConfig({ ...location, HARMONIZED_LOCAL_FILE: 'sample.zip' }).source.protocol, 'file:');
  const source = azureSource({ ...location, AZURE_GOLD_BLOB: 'published/2014 Morocco.zip' });
  assert.equal(source.href, 'https://stprometheusnasa.blob.core.windows.net/gold/published/2014%20Morocco.zip');
  assert.throws(() => feedConfig({ ...location, AZURE_GOLD_BLOB: 'latest.zip', HARMONIZED_LOCAL_FILE: 'sample.zip' }), /Choose/);
});

test('Azure paths and authentication configuration reject mismatches and excessive SAS permissions', () => {
  const configured = { ...location, AZURE_GOLD_BLOB: 'latest.zip' };
  for (const patch of [
    { AZURE_BLOB_ENDPOINT: 'http://stprometheusnasa.blob.core.windows.net' },
    { AZURE_BLOB_ENDPOINT: 'https://another.blob.core.windows.net' },
    { AZURE_GOLD_BLOB: '../latest.zip' }, { AZURE_GOLD_BLOB: '/latest.zip' },
    { AZURE_GOLD_CONTAINER: 'invalid/container' },
    { AZURE_STORAGE_SAS_TOKEN: 'sp=rw&sig=test-only-signature' },
    { AZURE_STORAGE_SAS_TOKEN: 'sp=r' },
  ]) assert.throws(() => azureSource({ ...configured, ...patch }));
  assert.equal(azureSource({ ...configured, AZURE_STORAGE_SAS_TOKEN: '?sp=r&sig=test%2Bonly' }).searchParams.get('sig'), 'test+only');
});

test('Azure publication uses the harmonized adapter, conditional cache and secret-free public metadata', async () => {
  const sample = fs.readFileSync(path.join(__dirname, '../test-data/harmonized/delivery_2014_morocco.zip'));
  let now = 0, valid = true, calls = 0;
  const config = feedConfig({ ...location, AZURE_GOLD_BLOB: 'published/latest.zip', AZURE_STORAGE_SAS_TOKEN: 'sp=r&sig=test-only-signature' });
  const feed = createHarmonizedFeed(config, { now: () => now, fetchImpl: async (url, options) => {
    assert.equal(new URL(url).pathname, '/gold/published/latest.zip');
    assert.equal(new URL(url).searchParams.get('sig'), 'test-only-signature');
    assert.equal(options.redirect, 'error');
    if (++calls > 1) assert.equal(options.headers['If-None-Match'], 'publication-one');
    return new Response(valid ? sample : 'invalid delivery', { headers: { etag: 'publication-one' } });
  } });
  const first = await feed.get();
  assert.equal(first.features.length, 117);
  assert.equal(first.metadata.preview, undefined);
  assert.equal(JSON.stringify(first).includes('test-only-signature'), false);
  valid = false; now += 60001;
  const stale = await feed.get();
  assert.equal(stale.metadata.feed_status, 'stale');
  assert.equal(stale.metadata.version, first.metadata.version);
});
