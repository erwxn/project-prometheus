import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { createGoldReader, validateGoldCatalog, sha256, GOLD_KINDS, publicGoldValue } from '../deploy/backend/gold_reader.mjs';
import { createGoldService } from './gold-service.mjs';
const require = createRequire(import.meta.url);
const express = require('express');
const { registerGoldRoutes } = require('./gold-routes');
require('./gold-config').loadGoldLocal();
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const evidence = path.join(root, 'deploy/evidence');
const routes = {
  morocco_fire_observations: '/api/fire-observations',
  morocco_harmonization_daily_summary: '/api/harmonization-daily-summary',
  morocco_harmonized_fire_groups: '/api/harmonized-fire-groups',
  morocco_harmonized_predictions: '/api/model-predictions',
  morocco_model_evaluation: '/api/model-evaluations',
  morocco_producer_reported_evaluation: '/api/producer-reported-evaluations',
};
const mode = process.argv.includes('--metadata-only') ? 'metadata-only' : process.argv.includes('--offline') ? 'offline-synthetic-parquet' : 'live-azure';
const report = { mode, checked_at_utc: new Date().toISOString(), status: 'not-completed', azure_writes_performed: false };
let stage = 'metadata', server;

async function save(name, value) {
  await fs.mkdir(evidence, { recursive: true });
  await fs.writeFile(path.join(evidence, name), JSON.stringify(publicGoldValue(value), null, 2) + '\n');
}
try {
  const pointer = JSON.parse(await fs.readFile(path.join(root, 'server/fixtures/gold-catalog/latest.json'), 'utf8'));
  const bytes = await fs.readFile(path.join(root, 'server/fixtures/gold-catalog/catalog.json'));
  if (sha256(bytes) !== pointer.catalog_sha256 || pointer.status !== 'COMMITTED' || pointer.schema_version !== 1 || pointer.catalog_path !== `catalog/morocco/snapshots/${pointer.catalog_sha256}/catalog.json`) throw Error('Invalid supplied metadata.');
  const catalog = validateGoldCatalog(JSON.parse(bytes));
  report.supplied_catalog_sha256 = pointer.catalog_sha256;
  report.supplied_catalog_sha256_verified = true;
  report.supplied_inventory = Object.fromEntries(Object.entries(catalog.datasets).map(([id, dataset]) => [id, { files: dataset.files.length, rows: dataset.row_count }]));
  report.supplied_parquet_files = Object.values(catalog.datasets).reduce((sum, dataset) => sum + dataset.files.length, 0);
  if (mode !== 'metadata-only') {
    stage = 'credentials';
    let reader;
    if (mode === 'offline-synthetic-parquet') reader = (await import('./fixtures/gold-fixture.mjs')).goldFixture().reader;
    else reader = createGoldReader();
    await reader.checkAccess();
    stage = 'data';
    const snapshot = await reader.getSnapshot();
    report.tested_snapshot = snapshot.snapshot;
    report.verified = {};
    const loaded = new Map();
    for (const id of Object.keys(GOLD_KINDS)) {
      const table = await reader.readDataset(snapshot, id);
      loaded.set(id, table.rows);
      if (table.snapshot !== snapshot.snapshot) throw Error('Snapshot changed.');
      report.verified[id] = { files: table.files_verified, parsed_rows: table.rows.length,
        dated_2026_rows: table.rows.filter(row => row.observed_at_utc?.startsWith('2026-')).length };
    }
    const service = createGoldService({ reader });
    const app = express(); registerGoldRoutes(app, { service });
    server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
    const base = `http://127.0.0.1:${server.address().port}`;
    const examples = { mode, snapshot: snapshot.snapshot, responses: {} };
    const catalogResponse = await fetch(`${base}/api/gold/catalog`);
    const publicCatalog = await catalogResponse.json();
    if (catalogResponse.status !== 200 || publicCatalog.snapshot !== snapshot.snapshot || Object.keys(publicCatalog.datasets).length !== 6) throw Error('Catalog API verification failed.');
    examples.responses['/api/gold/catalog'] = { status: publicCatalog.status, schema_version: publicCatalog.schema_version, snapshot: publicCatalog.snapshot,
      datasets: Object.fromEntries(Object.entries(publicCatalog.datasets).map(([id, dataset]) => [id, { kind: dataset.kind, catalog_row_count: dataset.catalog_row_count, file_count: dataset.file_count }])),
      capture_note: 'Dataset inventory summary; the endpoint itself returns complete safe file inventories.' };
    for (const [id, route] of Object.entries(routes)) {
      let count = 0, filteredCount, pages = 0;
      for (let page = 1; ; page++) {
        const response = await fetch(`${base}${route}?page_size=1000&page=${page}&snapshot=${snapshot.snapshot}`);
        if (response.status !== 200) throw Error('API verification failed.');
        const body = await response.json();
        if (body.metadata.snapshot !== snapshot.snapshot || body.data.some(row => row.country_iso3 !== 'MAR' || row.observed_at_utc.startsWith('2026-'))) throw Error('Scope or snapshot mismatch.');
        if (filteredCount !== undefined && filteredCount !== body.filtered_count) throw Error('Unstable filter count.');
        filteredCount = body.filtered_count; count += body.data.length; pages++;
        if (page === 1) examples.responses[route] = { ...body, data: body.data.slice(0, 1), capture_note: 'First public row only; not a full data export.' };
        if (page >= body.total_pages) break;
        if (page > 2500) throw Error('Pagination bound exceeded.');
      }
      if (count !== filteredCount) throw Error('Pagination row count mismatch.');
      Object.assign(report.verified[id], { scoped_rows: count, pages_verified: pages });
    }
    const checks = [
      ['/api/fire-observations?year=2026', 200, body => body.filtered_count === 0],
      ['/api/fire-observations?bbox=10,10,11,11', 200, body => body.filtered_count === 0],
      ['/api/fire-observations?page_size=1001', 400],
      [`/api/fire-observations?snapshot=${'0'.repeat(64)}`, 409],
    ];
    const expected2019 = loaded.get('morocco_fire_observations').filter(row => row.country_iso3 === 'MAR' && row.boundary_sha256 === snapshot.catalog.boundary_sha256 && row.observed_at_utc?.startsWith('2019-') && row.sensor === 'VIIRS').length;
    checks.push(['/api/fire-observations?start_date=2019-01-01&end_date=2019-12-31&sensor=VIIRS&page_size=1000', 200,
      body => body.filtered_count === expected2019 && body.data.every(row => row.observed_at_utc.startsWith('2019-') && row.sensor === 'VIIRS')]);
    for (const [route, status, check] of checks) {
      const response = await fetch(base + route), body = await response.json();
      if (response.status !== status || check && !check(body)) throw Error('Error or empty-result check failed.');
    }
    const metrics = await fetch(`${base}/api/model-evaluations/metrics?snapshot=${snapshot.snapshot}`);
    if (metrics.status !== 200) throw Error('Metrics verification failed.');
    const metricsBody = await metrics.json(); report.evaluation_metrics = metricsBody.metrics;
    const unknown = await fetch(`${base}/api/model-evaluations?label=unknown&snapshot=${snapshot.snapshot}`);
    const unknownBody = await unknown.json();
    if (unknown.status !== 200 || unknownBody.data.some(row => row.viirs_observed_label !== null)) throw Error('Unknown label changed.');
    examples.responses['/api/model-evaluations/metrics'] = metricsBody;
    report.pagination_filter_empty_and_conflict_checks = 'passed';
    report.positive_filter_2019_viirs_count = expected2019;
    await save(mode === 'live-azure' ? 'api-response-examples.json' : 'offline-api-response-examples.json', examples);
  }
  report.status = 'passed';
} catch {
  report.status = stage === 'credentials' ? 'blocked' : 'failed';
  report.blocker = stage === 'credentials' ? 'Valid backend read-only Gold SAS access is not configured or is unavailable/expired. Renew through the authorized private channel.'
    : 'Metadata, integrity, access or API verification did not complete. Provider errors and secrets are intentionally not recorded.';
  process.exitCode = stage === 'credentials' ? 2 : 1;
  if (mode === 'live-azure') {
    const capture = path.join(evidence, 'api-response-examples.json');
    try { await fs.access(capture); }
    catch { await save('api-response-examples.json', { mode, status: 'not-captured', reason: 'Live API captures require valid Gold access and successful verification.' }); }
  }
} finally {
  if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  const filename = mode === 'metadata-only' ? 'catalog-metadata-verification.json' : mode === 'live-azure' ? 'local-gold-verification.json' : 'offline-gold-verification.json';
  await save(filename, report);
  console.log(JSON.stringify(publicGoldValue(report), null, 2));
}
