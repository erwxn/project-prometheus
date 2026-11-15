import fs from 'node:fs';
import { parquetWriteBuffer } from 'hyparquet-writer';
import { sha256, GOLD_ENDPOINT, GOLD_POINTER, createGoldReader } from '../../deploy/backend/gold_reader.mjs';
import { createGoldService } from '../gold-service.mjs';

export const realCatalogBytes = fs.readFileSync(new URL('./gold-catalog/catalog.json', import.meta.url));
export const realPointer = JSON.parse(fs.readFileSync(new URL('./gold-catalog/latest.json', import.meta.url)));

/** Creates synthetic Parquet transport fixtures using every real manifest path and column schema. */
export function goldFixture() {
  const catalog = JSON.parse(realCatalogBytes), blobs = new Map(), calls = [];
  const boundary = catalog.boundary_sha256;
  const keys = Object.keys(catalog.datasets);
  for (const id of keys) {
    const dataset = catalog.datasets[id];
    dataset.row_count = 0;
    dataset.files.forEach((file, index) => {
      let rows = file.rows ? structuredClone(file.example_rows) : [];
      if (id === 'morocco_fire_observations') {
        const seed = file.example_rows[0];
        rows = Array.from({ length: 107 }, (_, i) => ({ ...seed, observation_id: `synthetic-${i}`, latitude: i === 106 ? 40.4 : 35.01,
          country_iso3: i === 106 ? 'ESP' : 'MAR',
          longitude: i === 106 ? -3.7 : -5.02, observed_at_utc: i === 105 ? '2026-01-01T00:00:00.000Z' : '2019-04-19T02:44:00.000Z', sensor: i % 2 ? 'MODIS' : 'VIIRS' }));
      }
      if (id === 'morocco_model_evaluation') {
        const seed = file.example_rows[0];
        rows = index ? [] : [
          { ...seed, record_id: 'synthetic-positive', latitude: 35.01, longitude: -5.02, harmonization_score: 0.9, viirs_observed_label: 1, evaluation_status: 'OBSERVABLE' },
          { ...seed, record_id: 'synthetic-negative', latitude: 35.01, longitude: -5.02, harmonization_score: 0.8, viirs_observed_label: 0, evaluation_status: 'OBSERVABLE' },
          { ...seed, record_id: 'synthetic-unknown', latitude: 35.01, longitude: -5.02, harmonization_score: 0.9, viirs_observed_label: null, evaluation_status: 'NO_SUPPORT' },
          { ...seed, record_id: 'synthetic-outside-support', latitude: 35.01, longitude: -5.02, harmonization_score: 0.1, viirs_observed_label: 1, evaluation_status: 'NO_SUPPORT' },
        ];
      }
      const columnData = file.schema.map(field => {
        const type = field.type.startsWith('timestamp') ? 'TIMESTAMP' : field.type === 'bool' ? 'BOOLEAN' : field.type.startsWith('int') ? 'INT64' : field.type === 'double' ? 'DOUBLE' : 'STRING';
        const data = rows.map(row => {
          const value = row[field.name] ?? null;
          if (value === null) return null;
          if (type === 'TIMESTAMP') return new Date(value);
          if (type === 'INT64') return BigInt(value);
          return value;
        });
        return { name: field.name, type, data };
      });
      const bytes = Buffer.from(parquetWriteBuffer({ columnData }));
      file.rows = rows.length; file.bytes = bytes.length; file.sha256 = sha256(bytes);
      dataset.row_count += rows.length;
      blobs.set(file.blob_path, bytes);
    });
    if (id === 'morocco_model_evaluation') dataset.evaluated_cells = 2;
  }
  let catalogBytes, pointerBytes, etag = '"fixture-one"', clock = Date.parse('2026-11-15T06:00:00Z');
  let secret = { account: 'stprometheusnasa', container: 'gold', sas_token: 'sp=r&sr=c&spr=https&se=2026-11-15T08%3A00%3A00Z&sig=synthetic-test-signature', expires_at: '2026-11-15T08:00:00Z' };
  let pointerRaces = 0, fault;
  function publish(nextEtag = '"fixture-two"') {
    catalogBytes = Buffer.from(JSON.stringify(catalog));
    const hash = sha256(catalogBytes);
    pointerBytes = Buffer.from(JSON.stringify({ schema_version: 1, status: 'COMMITTED', catalog_sha256: hash, catalog_path: `catalog/morocco/snapshots/${hash}/catalog.json` }));
    etag = nextEtag;
    return hash;
  }
  publish('"fixture-one"');
  const fetchImpl = async (url, options) => {
    const request = new URL(url), blobPath = decodeURIComponent(request.pathname.slice('/gold/'.length));
    calls.push({ path: blobPath, method: options.method, headers: options.headers });
    if (fault) { const response = fault(blobPath, options); if (response) return response; }
    if (blobPath === GOLD_POINTER) {
      if (options.method === 'HEAD') {
        if (pointerRaces > 0) { pointerRaces--; return new Response(null, { status: 412 }); }
        return new Response(null, { headers: { etag } });
      }
      if (options.headers['If-None-Match'] === etag) return new Response(null, { status: 304 });
      return new Response(pointerBytes, { headers: { etag } });
    }
    const pointer = JSON.parse(pointerBytes);
    if (blobPath === pointer.catalog_path) return new Response(catalogBytes);
    if (blobs.has(blobPath)) return new Response(blobs.get(blobPath));
    return new Response('synthetic provider detail that must never reach the public API', { status: 404 });
  };
  const env = { PROMETHEUS_GOLD_AUTH: 'sas', PROMETHEUS_GOLD_ACCESS_FILE: 'synthetic-fixture-only.json' };
  const reader = createGoldReader({ env, fetchImpl, now: () => clock, readAccessFile: async () => Buffer.from(JSON.stringify(secret)) });
  const service = createGoldService({ reader });
  return { catalog, reader, service, blobs, calls, env, boundary, publish,
    setTime: value => { clock = value; }, advance: ms => { clock += ms; },
    setSecret: value => { secret = value; }, getSecret: () => ({ ...secret }),
    setRaces: value => { pointerRaces = value; }, setFault: value => { fault = value; },
    getPointer: () => JSON.parse(pointerBytes), getCatalogBytes: () => catalogBytes,
    endpoint: GOLD_ENDPOINT,
  };
}
