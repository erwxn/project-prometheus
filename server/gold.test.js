const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const express = require('express');
const { registerGoldRoutes } = require('./gold-routes');

async function fixture() { return (await import('./fixtures/gold-fixture.mjs')).goldFixture(); }
async function http(service, run) {
  const app = express(); registerGoldRoutes(app, { service });
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  try { await run(`http://127.0.0.1:${server.address().port}`); }
  finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}

test('actual supplied catalog hash, dictionary definitions, all 146 paths and varied schemas validate', async () => {
  const { realCatalogBytes, realPointer } = await import('./fixtures/gold-fixture.mjs');
  const { sha256, validateGoldCatalog } = await import('../deploy/backend/gold_reader.mjs');
  assert.equal(sha256(realCatalogBytes), realPointer.catalog_sha256);
  const catalog = validateGoldCatalog(JSON.parse(realCatalogBytes));
  const counts = Object.values(catalog.datasets).map(dataset => [dataset.files.length, dataset.row_count]);
  assert.deepEqual(counts, [[1, 77793], [3, 126], [3, 160], [134, 1826], [2, 117], [3, 1430]]);
  assert.equal(new Set(catalog.datasets.morocco_harmonized_predictions.files.map(file => JSON.stringify(file.schema))).size, 3);
  assert.equal(catalog.datasets.morocco_harmonized_predictions.files.filter(file => file.rows === 0).length, 1);
});

test('real manifest paths and per-file schemas read complete synthetic Parquet arrays, including empty files', async () => {
  const f = await fixture(), snapshot = await f.reader.getSnapshot();
  let verified = 0;
  for (const [id, dataset] of Object.entries(f.catalog.datasets)) {
    const table = await f.reader.readDataset(snapshot, id);
    assert.equal(table.rows.length, dataset.row_count); assert.equal(table.files_verified, dataset.files.length);
    verified += table.files_verified;
  }
  assert.equal(verified, 146);
  assert.equal(f.calls.filter(call => call.path.endsWith('.parquet')).length, 146);
});

test('Morocco and non-2026 scope and all filters precede pagination; empty selections stay empty', async () => {
  const f = await fixture(), id = 'morocco_fire_observations';
  const first = await f.service.query(id, { page_size: '100' });
  assert.equal(first.catalog_count, 107); assert.equal(first.scoped_count, 105); assert.equal(first.filtered_count, 105); assert.equal(first.data.length, 100);
  const second = await f.service.query(id, { page: '2', page_size: '100' });
  assert.equal(second.data.length, 5);
  assert.equal(new Set([...first.data, ...second.data].map(row => row.observation_id)).size, 105);
  const filtered = await f.service.query(id, { sensor: 'VIIRS', start_date: '2019-04-19', end_date: '2019-04-19', page_size: '2', page: '2' });
  assert.equal(filtered.filtered_count, 53); assert.equal(filtered.data.length, 2);
  assert.equal((await f.service.query(id, { year: '2026' })).filtered_count, 0);
  assert.equal((await f.service.query(id, { bbox: '10,10,11,11' })).data.length, 0);
});

test('evaluation null labels remain unknown, unobservable known labels are excluded, scores are not probabilities', async () => {
  const f = await fixture(), id = 'morocco_model_evaluation';
  const rows = await f.service.query(id);
  assert.equal(rows.filtered_count, 4);
  assert.equal(rows.data.find(row => row.record_id === 'synthetic-unknown').viirs_observed_label, null);
  const result = await f.service.query(id, {}, true), m = result.metrics;
  assert.equal(m.known_labels, 3); assert.equal(m.unknown_labels, 1); assert.equal(m.evaluated_rows, 2);
  assert.equal(m.tp, 1); assert.equal(m.fp, 1); assert.equal(m.tn, 0); assert.equal(m.fn, 0);
  assert.equal(m.precision, 0.5); assert.equal(m.recall, 1);
  const unknown = await f.service.query(id, { label: 'unknown' }, true);
  assert.equal(unknown.metrics.evaluated_rows, 0); assert.equal(unknown.metrics.accuracy, null); assert.equal(unknown.metrics.precision, null);
  assert.equal(rows.metadata.probability_calibration_established, false);
  const reported = await f.service.producerMetrics({ year: '2014' });
  assert.equal(reported.independently_verified, false); assert.equal(reported.metrics_by_year.length, 1);
  assert.equal((await f.service.producerMetrics({ year: '2026' })).metrics_by_year.length, 0);
});

test('pointer conditional requests use ETags and bounded 412 retries', async () => {
  const f = await fixture(); f.setRaces(2);
  const snapshot = await f.reader.getSnapshot();
  assert.equal(f.calls.filter(call => call.method === 'HEAD').length, 3);
  f.advance(30001); assert.equal((await f.reader.getSnapshot()).snapshot, snapshot.snapshot);
  assert.equal(f.calls.at(-1).headers['If-None-Match'], '"fixture-one"');
  const failed = await fixture(); failed.setRaces(10);
  await assert.rejects(failed.reader.getSnapshot(), error => error.status === 409);
  assert.equal(failed.calls.filter(call => call.method === 'HEAD').length, 3);
});

test('catalog hash and committed status must validate before any Parquet is requested', async () => {
  for (const mode of ['hash', 'status', 'etag']) {
    const f = await fixture();
    f.setFault((path, options) => {
      if (mode === 'hash' && path.includes('/snapshots/')) return new Response('{}');
      if (mode === 'status' && path.endsWith('latest.json')) return new Response(JSON.stringify({ ...f.getPointer(), status: 'PENDING' }), { headers: { etag: '"x"' } });
      if (mode === 'etag' && options.method === 'HEAD') return new Response(null, { headers: { etag: '"wrong"' } });
    });
    await assert.rejects(f.reader.getSnapshot());
    assert.equal(f.calls.some(call => call.path.endsWith('.parquet')), false);
  }
});

test('Parquet checksum, byte length, row count and exact column names are all enforced', async () => {
  for (const mode of ['checksum', 'length', 'rows', 'columns']) {
    const f = await fixture(), dataset = f.catalog.datasets.morocco_fire_observations, file = dataset.files[0];
    if (mode === 'checksum') { const bytes = Buffer.from(f.blobs.get(file.blob_path)); bytes[5] ^= 1; f.blobs.set(file.blob_path, bytes); }
    if (mode === 'length') file.bytes++;
    if (mode === 'rows') { file.rows++; dataset.row_count++; }
    if (mode === 'columns') file.schema.push({ name: 'unexpected_column', type: 'double', nullable: true });
    f.publish();
    const snapshot = await f.reader.getSnapshot();
    await assert.rejects(f.reader.readDataset(snapshot, 'morocco_fire_observations'));
  }
});

test('cached queries recheck expiry, SAS permissions and actual token expiry cannot be extended by JSON', async () => {
  const f = await fixture(); await f.service.query('morocco_fire_observations');
  f.setTime(Date.parse('2026-11-15T08:00:00Z'));
  await assert.rejects(f.service.query('morocco_fire_observations'));
  f.setSecret({ ...f.getSecret(), expires_at: '2099-01-01T00:00:00Z' });
  await assert.rejects(f.reader.getSnapshot());
  const write = await fixture(); write.setSecret({ ...write.getSecret(), sas_token: 'sp=rw&se=2099-01-01T00%3A00%3A00Z&sig=synthetic' });
  await assert.rejects(write.reader.getSnapshot()); assert.equal(write.calls.length, 0);
  const delegated = await fixture();
  delegated.setSecret({ ...delegated.getSecret(), sas_token: delegated.getSecret().sas_token + '&skt=2026-11-15T05%3A00%3A00Z&ske=2026-11-15T06%3A30%3A00Z' });
  await delegated.service.query('morocco_fire_observations');
  delegated.setTime(Date.parse('2026-11-15T06:30:00Z'));
  await assert.rejects(delegated.service.query('morocco_fire_observations'));
});

test('private credential replacement rebuilds the reader session even for an unchanged catalog', async () => {
  const f = await fixture();
  const first = await f.reader.getSnapshot(); await f.service.query('morocco_fire_observations');
  const before = f.calls.filter(call => call.path.endsWith('.parquet')).length;
  f.setSecret({ ...f.getSecret(), sas_token: f.getSecret().sas_token.replace('synthetic-test-signature', 'synthetic-replacement') });
  const next = await f.reader.getSnapshot();
  assert.equal(next.snapshot, first.snapshot); assert.notEqual(next.generation, first.generation);
  await f.service.query('morocco_fire_observations');
  assert.equal(f.calls.filter(call => call.path.endsWith('.parquet')).length, before + 1);
});

test('catalog changes invalidate queries and metrics and stale requested snapshots return 409', async () => {
  const f = await fixture(), id = 'morocco_model_evaluation';
  const first = await f.service.query(id, {}, true); assert.equal(first.metrics.tp, 1);
  f.catalog.datasets[id].metrics_by_acquisition.forEach(item => { item.metrics.threshold = 0.95; });
  const hash = f.publish(); f.advance(30001);
  const next = await f.service.query(id, {}, true);
  assert.equal(next.metadata.snapshot, hash); assert.equal(next.metrics.tp, 0); assert.equal(next.metrics.fp, 0);
  await assert.rejects(f.service.query(id, { snapshot: first.metadata.snapshot }), error => error.status === 409);
});

test('service verifies the snapshot actually returned by the reader', async () => {
  const f = await fixture();
  const { createGoldService } = await import('./gold-service.mjs');
  const service = createGoldService({ reader: { getSnapshot: f.reader.getSnapshot, readDataset: async (...args) => ({ ...await f.reader.readDataset(...args), snapshot: '0'.repeat(64) }) } });
  await assert.rejects(service.query('morocco_fire_observations'), error => error.status === 409);
});

test('overlapping old and new snapshot queries cannot pollute the new scoped-row cache', async () => {
  const f = await fixture();
  const { createGoldService } = await import('./gold-service.mjs');
  let snapshot = { snapshot: 'a'.repeat(64), generation: 1, catalog: f.catalog };
  let first = true, release, started;
  const waiting = new Promise(resolve => { release = resolve; });
  const beginning = new Promise(resolve => { started = resolve; });
  const seed = f.catalog.datasets.morocco_fire_observations.files[0].example_rows[0];
  const reader = {
    getSnapshot: async () => snapshot,
    readDataset: async requested => {
      const old = first; first = false;
      if (old) { started(); await waiting; }
      return { snapshot: requested.snapshot, generation: requested.generation,
        rows: [{ ...seed, observation_id: old ? 'old-epoch' : 'new-epoch', latitude: 35.01, longitude: -5.02 }] };
    },
  };
  const service = createGoldService({ reader });
  const oldRequest = service.query('morocco_fire_observations');
  await beginning;
  snapshot = { ...snapshot, snapshot: 'b'.repeat(64) };
  const fresh = await service.query('morocco_fire_observations');
  assert.equal(fresh.data[0].observation_id, 'new-epoch');
  release(); await assert.rejects(oldRequest, error => error.status === 409);
  const differentPage = await service.query('morocco_fire_observations', { page_size: '1' });
  assert.equal(differentPage.data[0].observation_id, 'new-epoch');
});

test('backend environment authentication accepts a read-only container SAS and rejects mixed or account-wide credentials', async () => {
  const f = await fixture();
  const { createGoldReader } = await import('../deploy/backend/gold_reader.mjs');
  const env = { PROMETHEUS_GOLD_AUTH: 'sas', PROMETHEUS_GOLD_SAS_TOKEN: f.getSecret().sas_token };
  const options = { env, now: () => Date.parse('2026-11-15T06:00:00Z') };
  assert.ok((await createGoldReader(options).checkAccess()).expiry > options.now());
  env.PROMETHEUS_GOLD_ACCESS_FILE = 'synthetic-private.json';
  await assert.rejects(createGoldReader(options).checkAccess());
  delete env.PROMETHEUS_GOLD_ACCESS_FILE;
  env.PROMETHEUS_GOLD_SAS_TOKEN = env.PROMETHEUS_GOLD_SAS_TOKEN.replace('sr=c', 'ss=b&srt=sco');
  await assert.rejects(createGoldReader(options).checkAccess());
});

test('national summaries reject spatial and score filters that cannot define a valid aggregate', async () => {
  const f = await fixture();
  for (const input of [{ bbox: '-6,33,-5,35' }, { min_score: '0.5' }, { sensor: 'MODIS' }]) {
    await assert.rejects(f.service.query('morocco_harmonization_daily_summary', input), error => error.status === 400);
  }
});

test('full Express app keeps legacy samples and health available while missing Gold access returns sanitized 503', () => {
  const { spawnSync } = require('node:child_process');
  const env = { ...process.env, NODE_ENV: 'production' };
  for (const key of Object.keys(env)) if (key.startsWith('PROMETHEUS_GOLD_')) delete env[key];
  const script = `
    const assert = require('node:assert/strict');
    const app = require('./server/index');
    const server = app.listen(0, '127.0.0.1', async () => {
      try {
        const base = 'http://127.0.0.1:' + server.address().port;
        for (const route of ['/health','/api/v1/fires/sample']) assert.equal((await fetch(base+route)).status,200);
        const response = await fetch(base+'/api/fire-observations');
        assert.equal(response.status,503);
        assert.deepEqual(await response.json(),{error:'Gold data unavailable. Check backend access and retry.',code:'GOLD_503'});
        assert.equal((await fetch(base+'/api/fire-observations?page_size=1001')).status,400);
      } catch { process.exitCode=1; }
      finally { server.closeAllConnections(); server.close(); }
    });`;
  const result = spawnSync(process.execPath, ['-e', script], { cwd: require('node:path').join(__dirname, '..'), env, encoding: 'utf8', timeout: 20000 });
  assert.equal(result.status, 0, 'Full application smoke check failed.');
});

test('HTTP endpoints keep all populations distinct and sanitize 400, 409, 503 and provider errors', async () => {
  const f = await fixture();
  await http(f.service, async base => {
    for (const route of ['gold/catalog', 'fire-observations', 'model-predictions', 'harmonization-daily-summary', 'harmonized-fire-groups', 'model-evaluations', 'model-evaluations/metrics', 'producer-reported-evaluations', 'producer-reported-evaluations/metrics']) {
      const response = await fetch(`${base}/api/${route}`);
      assert.equal(response.status, 200, route); assert.equal(response.headers.get('cache-control'), 'no-store');
      const text = await response.text(); assert.equal(text.includes('synthetic-test-signature'), false); assert.equal(text.includes('?sp='), false);
    }
    for (const query of ['page_size=1001', 'page=0', 'start_date=2025-02-30', 'bbox=1,2,3', 'sensor=A&sensor=B', 'unknown=x']) {
      assert.equal((await fetch(`${base}/api/fire-observations?${query}`)).status, 400, query);
    }
    assert.equal((await fetch(`${base}/api/fire-observations?snapshot=${'0'.repeat(64)}`)).status, 409);
    f.setTime(Date.parse('2026-11-15T08:00:00Z'));
    const unavailable = await fetch(`${base}/api/fire-observations`);
    assert.equal(unavailable.status, 503); assert.equal((await unavailable.text()).includes('sig='), false);
  });
  await http({ catalog: async () => { throw Error('https://private.invalid/?sig=DO-NOT-DISCLOSE'); } }, async base => {
    const response = await fetch(`${base}/api/gold/catalog`);
    assert.equal(response.status, 503); assert.equal((await response.text()).includes('DO-NOT-DISCLOSE'), false);
  });
});

test('map feed serves only the selected Morocco Gold population, not legacy demo points',async()=>{
  const f=await fixture();
  const models=await f.service.explorer();
  assert.equal(models.metadata.gold,true);assert.equal(models.metadata.gold_sensor,'Harmonized');assert.equal(models.metadata.total_features,133);
  assert.ok(models.features.every(feature=>feature.properties.country_iso3==='MAR'&&feature.properties.record_unit==='model_candidate'&&feature.properties.raw_frp===null));
  assert.equal(models.features[0].properties.p_viirs,undefined);
  const raw=await f.service.explorer({sensor:'VIIRS'});assert.equal(raw.metadata.total_features,53);
  assert.ok(raw.features.every(feature=>feature.properties.satellite==='VIIRS'&&!feature.properties.observed_at_utc.startsWith('2026-')));
  await http(f.service,async base=>{
    const first=await fetch(base+'/api/gold/explorer');assert.equal(first.status,200);assert.equal(first.headers.get('content-encoding'),'gzip');
    const data=await first.json();assert.equal(data.features.length,133);
    const unchanged=await fetch(base+'/api/gold/explorer',{headers:{'If-None-Match':first.headers.get('etag')}});assert.equal(unchanged.status,304);
    const records=await fetch(base+'/api/model-predictions');assert.equal(records.status,200);
    assert.equal((await fetch(base+'/api/model-predictions',{headers:{'If-None-Match':records.headers.get('etag')}})).status,304);
    f.setTime(Date.parse('2026-11-15T08:00:00Z'));
    assert.equal((await fetch(base+'/api/gold/explorer',{headers:{'If-None-Match':first.headers.get('etag')}})).status,503);
    assert.equal((await fetch(base+'/api/model-predictions',{headers:{'If-None-Match':records.headers.get('etag')}})).status,503);
  });
});

test('actual expanded Gold catalog accepts unavailable producer metrics without inventing values',async()=>{
 const fs=require('node:fs');
 const {realCatalogBytes}=await import('./fixtures/gold-fixture.mjs');
 const {validateGoldCatalog,GoldError}=await import('../deploy/backend/gold_reader.mjs');
 const {createGoldService}=await import('./gold-service.mjs');
 const publication=JSON.parse(fs.readFileSync(require('node:path').join(__dirname,'fixtures/gold-catalog/producer-metrics-27161f76.json'),'utf8'));
 const catalog=JSON.parse(realCatalogBytes);
 const dataset=catalog.datasets.morocco_producer_reported_evaluation;
 dataset.producer_reported_metrics_by_year=publication.producer_reported_metrics_by_year;
 assert.equal(validateGoldCatalog(catalog),catalog);
 assert.equal(dataset.producer_reported_metrics_by_year.find(item=>item.year===2015).metrics,null);
 const service=createGoldService({reader:{getSnapshot:async()=>({snapshot:publication.catalog_sha256,generation:1,catalog})}});
 const response=await service.producerMetrics();
 assert.equal(response.independently_verified,false);
 assert.equal(response.metrics_by_year.find(item=>item.year===2015).metrics,null);
 assert.ok(response.metrics_by_year.every(item=>item.year!==2026&&item.independently_verified===false));
 for(const invalid of [undefined,false,0,'',[]]){
  const changed=structuredClone(catalog);changed.datasets.morocco_producer_reported_evaluation.producer_reported_metrics_by_year[0].metrics=invalid;
  assert.throws(()=>validateGoldCatalog(changed),GoldError);
 }
});

// These fixtures are exact committed Azure metadata, not substitute runtime publications.
test('separate Algeria and comparison publications validate their actual committed schemas and hashes',async()=>{
 const fs=require('node:fs'),path=require('node:path');
 const {validateGoldCatalog,sha256,GoldError}=await import('../deploy/backend/gold_reader.mjs');
 for(const publication of ['algeria','morocco-algeria']){
  const dir=path.join(__dirname,'fixtures/gold-catalog',publication);
  const pointer=JSON.parse(fs.readFileSync(path.join(dir,'latest.json'))),bytes=fs.readFileSync(path.join(dir,'catalog.json'));
  assert.equal(sha256(bytes),pointer.catalog_sha256);
  const catalog=JSON.parse(bytes);assert.equal(validateGoldCatalog(catalog,{publication}),catalog);
  assert.throws(()=>validateGoldCatalog(catalog),GoldError);
  if(publication==='algeria'){
   assert.equal(catalog.datasets.algeria_harmonized_predictions.row_count,7031);
   assert.equal(catalog.datasets.algeria_fire_observations.status,'unavailable');
   const bad=structuredClone(catalog);bad.datasets.algeria_harmonized_predictions.files[0].blob_path='earthdata/morocco/runs/wrong/predictions.parquet';
   assert.throws(()=>validateGoldCatalog(bad,{publication}),GoldError);
  }else{
   assert.equal(catalog.datasets.morocco_algeria_candidate_comparison.row_count,24);
   assert.equal(catalog.common_source_acquisitions.length,20);
   assert.equal(catalog.comparison_status,'DESCRIPTIVE_ONLY_COVERAGE_UNVERIFIED');
   const bad=structuredClone(catalog);bad.source_catalogs[0].catalog_path=bad.source_catalogs[1].catalog_path;
   assert.throws(()=>validateGoldCatalog(bad,{publication}),GoldError);
  }
 }
});

test('Algeria country, UTC and spatial filters precede pagination without Morocco clipping',async()=>{
 const fs=require('node:fs'),path=require('node:path');
 const {createGoldService}=await import('./gold-service.mjs');
 const catalog=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/gold-catalog/algeria/catalog.json')));
 const pointer=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/gold-catalog/algeria/latest.json')));
 const snapshot={snapshot:pointer.catalog_sha256,generation:1,catalog};
 const rows=catalog.datasets.algeria_harmonized_predictions.files.flatMap(file=>file.example_rows||[]);
 assert.ok(rows.length>0);
 const service=createGoldService({country:'DZA',reader:{getSnapshot:async()=>snapshot,readDataset:async()=>({...snapshot,rows})}});
 const result=await service.query('morocco_harmonized_predictions',{country:'DZA',year:'2015',page_size:'2'});
 assert.equal(result.filtered_count,rows.length);assert.equal(result.data.length,2);
 assert.ok(result.data.every(row=>row.country_iso3==='DZA'));
 assert.equal((await service.query('morocco_harmonized_predictions',{country:'DZA',year:'2014'})).filtered_count,0);
 const day=rows[0].observed_at_utc.slice(0,10);
 const filtered=await service.query('morocco_harmonized_predictions',{country:'DZA',start_date:day,end_date:day,page_size:'1'});
 assert.equal(filtered.filtered_count,rows.filter(row=>row.observed_at_utc.startsWith(day)).length);
 assert.equal((await service.query('morocco_harmonized_predictions',{country:'DZA',bbox:'-10,20,-9,21'})).filtered_count,0);
 await assert.rejects(()=>service.query('morocco_harmonized_predictions',{country:'MAR'}));
 const map=await service.explorer({country:'DZA'});assert.equal(map.features.length,rows.length);assert.ok(map.features.every(f=>f.properties.country_iso3==='DZA'&&f.properties.gold_verified));
 await http(service,async base=>{
  const response=await fetch(base+'/api/model-predictions?country=DZA&year=2015&page_size=2');assert.equal(response.status,200);assert.equal((await response.json()).filtered_count,rows.length);
  assert.equal((await fetch(base+'/api/model-predictions?country=USA')).status,400);
 });
});
