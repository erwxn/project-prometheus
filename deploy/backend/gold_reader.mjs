import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { parquetMetadata, parquetReadObjects } from 'hyparquet';
import { compressors } from 'hyparquet-compressors';

export const GOLD_KINDS = Object.freeze({
  morocco_fire_observations: 'source_observation',
  morocco_harmonization_daily_summary: 'harmonization_daily_summary',
  morocco_harmonized_fire_groups: 'harmonized_fire_group',
  morocco_harmonized_predictions: 'model_candidate',
  morocco_model_evaluation: 'model_evaluation',
  morocco_producer_reported_evaluation: 'producer_reported_evaluation',
});
export const GOLD_ENDPOINT = 'https://stprometheusnasa.blob.core.windows.net/gold/';
export const GOLD_POINTER = 'catalog/morocco/latest.json';

/** Restricts each reader to its own committed publication and dataset namespace. */
function profileFor(publication) {
  check(['morocco', 'algeria', 'morocco-algeria'].includes(publication));
  const comparison = publication === 'morocco-algeria';
  const country = publication === 'morocco' ? 'MAR' : publication === 'algeria' ? 'DZA' : null;
  const kinds = comparison ? { morocco_algeria_candidate_comparison: 'candidate_comparison' }
    : Object.fromEntries(Object.entries(GOLD_KINDS).map(([id, kind]) => [id.replace('morocco_', publication + '_'), kind]));
  return { publication, country, kinds, comparison, pointer: `catalog/${publication}/latest.json` };
}

export const sha256 = buffer => createHash('sha256').update(buffer).digest('hex');

/** Exposes only a safe classification, never a provider error or credential. */
export class GoldError extends Error {
  constructor(status = 503) { super('Gold request unavailable.'); this.status = status; }
}
function check(condition) { if (!condition) throw new GoldError(); }
function isHash(value) { return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value); }
function safePath(value) {
  check(typeof value === 'string' && value.length > 0 && value.length < 1024 && !/[\\?#%:\x00-\x20]/.test(value));
  check(value.split('/').every(part => part && part !== '.' && part !== '..'));
  return value;
}
function integer(value, minimum = 0) { return Number.isSafeInteger(value) && value >= minimum; }

/** Validates the actual schema-v1 dictionary catalog and every complete file definition. */
export function validateGoldCatalog(catalog, { maxRows = 250000, maxBytes = 128 * 1024 * 1024, publication = 'morocco' } = {}) {
  const profile = profileFor(publication);
  check(catalog?.schema_version === 1 && catalog.status === 'COMMITTED' && catalog.country_iso3 === profile.country && (profile.comparison || isHash(catalog.boundary_sha256)));
  check(catalog.datasets && !Array.isArray(catalog.datasets) && Object.keys(catalog.datasets).length === Object.keys(profile.kinds).length);
  const paths = new Set(); let rows = 0, bytes = 0, fileCount = 0;
  for (const [id, kind] of Object.entries(profile.kinds)) {
    const dataset = catalog.datasets[id];
    if (profile.country === 'DZA' && ['algeria_fire_observations', 'algeria_model_evaluation'].includes(id) && dataset?.status === 'unavailable') {
      check(dataset.row_count === 0 && Array.isArray(dataset.files) && dataset.files.length === 0 && typeof dataset.reason === 'string');
      continue;
    }
    check(dataset?.kind === kind && dataset.status === 'available' && dataset.probability_calibration_established === false && typeof dataset.score_interpretation === 'string');
    check(integer(dataset.row_count) && Array.isArray(dataset.files) && dataset.files.length <= 512);
    let datasetRows = 0;
    for (const file of dataset.files) {
      safePath(file.blob_path);
      check(file.blob_path.startsWith(profile.comparison ? 'comparisons/morocco-algeria/runs/' : `${kind === 'source_observation' ? 'firms' : 'earthdata'}/${publication}/runs/`));
      check(file.blob_path.endsWith('.parquet') && file.container === 'gold' && !paths.has(file.blob_path));
      paths.add(file.blob_path);
      check(isHash(file.sha256) && (profile.comparison || file.boundary_sha256 === catalog.boundary_sha256) && integer(file.bytes, 1) && file.bytes <= 32 * 1024 * 1024 && integer(file.rows));
      check(Array.isArray(file.schema) && file.schema.length > 0 && file.schema.length <= 256);
      const names = file.schema.map(field => field.name);
      check(names.every(name => typeof name === 'string' && /^[a-zA-Z_][a-zA-Z0-9_]{0,127}$/.test(name)) && new Set(names).size === names.length);
      check((profile.comparison ? ['observed_at_utc', 'country_iso3', 'year', 'month', 'candidate_cells', 'comparison_status'] : ['observed_at_utc', 'country_iso3', 'boundary_sha256']).every(name => names.includes(name)));
      if (kind !== 'harmonization_daily_summary' && !profile.comparison) check(['latitude', 'longitude'].every(name => names.includes(name)));
      if (kind === 'model_evaluation') check(['viirs_observed_label', 'harmonization_score', 'evaluation_status', 'source_acquisition'].every(name => names.includes(name)));
      if (kind === 'producer_reported_evaluation') check(['reported_viirs_observed_label', 'evaluation_status', 'label_support_verified'].every(name => names.includes(name)));
      check(file.schema.every(field => typeof field.type === 'string' && typeof field.nullable === 'boolean'));
      if (file.model_sha256 != null) check(isHash(file.model_sha256));
      rows += file.rows; datasetRows += file.rows; bytes += file.bytes; fileCount++;
    }
    check(datasetRows === dataset.row_count);
    if (kind === 'model_evaluation') {
      check(integer(dataset.evaluated_cells) && dataset.evaluated_cells <= dataset.row_count && Array.isArray(dataset.metrics_by_acquisition));
      check(dataset.metrics_by_acquisition.length <= 512);
    }
    if (kind === 'producer_reported_evaluation' && (profile.country === 'MAR' || dataset.producer_reported_metrics_by_year !== undefined)) {
      check(Array.isArray(dataset.producer_reported_metrics_by_year) && dataset.producer_reported_metrics_by_year.length <= 200);
      // Null means producer metrics were unavailable; it must not invalidate other datasets or become zero.
      for (const item of dataset.producer_reported_metrics_by_year) check(integer(item.year, 1900) && item.year <= 2200 && item.independently_verified === false && typeof item.population === 'string' && (item.metrics === null || item.metrics && typeof item.metrics === 'object' && !Array.isArray(item.metrics)));
    }
  }
  if (profile.comparison) {
    check(catalog.comparison_status === 'DESCRIPTIVE_ONLY_COVERAGE_UNVERIFIED' && Array.isArray(catalog.countries) && catalog.countries.length === 2 && catalog.countries.includes('MAR') && catalog.countries.includes('DZA'));
    check(Array.isArray(catalog.source_catalogs) && catalog.source_catalogs.length === 2 && new Set(catalog.source_catalogs.map(ref => ref.country_iso3)).size === 2);
    for (const ref of catalog.source_catalogs) {
      check(['MAR', 'DZA'].includes(ref.country_iso3) && isHash(ref.catalog_sha256));
      check(safePath(ref.catalog_path) === `catalog/${ref.country_iso3 === 'MAR' ? 'morocco' : 'algeria'}/snapshots/${ref.catalog_sha256}/catalog.json`);
    }
    check(Array.isArray(catalog.common_source_acquisitions) && new Set(catalog.common_source_acquisitions).size === catalog.common_source_acquisitions.length && catalog.common_source_acquisitions.every(value => typeof value === 'string' && /^A\d{7}\.\d{4}$/.test(value)));
  }
  check(fileCount <= 512 && rows <= maxRows && bytes <= maxBytes);
  return catalog;
}

function cleanValue(value, depth = 0) {
  check(depth < 20);
  if (value == null) return null;
  if (value instanceof Date) { check(Number.isFinite(value.getTime())); return value.toISOString(); }
  if (typeof value === 'bigint') { check(Number.isSafeInteger(Number(value))); return Number(value); }
  if (typeof value === 'number') { check(Number.isFinite(value)); return value; }
  if (typeof value === 'string') { check(value.length <= 65536 && !/https?:\/\/|(?:^|[?&])(?:sig|sv|se|sp)=/i.test(value)); return value; }
  if (typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.map(item => cleanValue(item, depth + 1));
  check(typeof value === 'object');
  const entries = Object.entries(value);
  check(entries.every(([key]) => !/sas|secret|token|password|signed_url/i.test(key)));
  return Object.fromEntries(entries.map(([key, item]) => [key, cleanValue(item, depth + 1)]));
}
export const publicGoldValue = cleanValue;

/** Projects only verified columns and retains null evaluation labels and per-file provenance. */
function normalizeRow(row, file, kind) {
  const result = Object.fromEntries(file.schema.map(({ name }) => [name, cleanValue(row[name])]));
  if (result.observed_at_utc !== null) {
    const stamp = result.observed_at_utc;
    check(typeof stamp === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(stamp));
    const time = Date.parse(stamp);
    check(Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === stamp.slice(0, 10));
  }
  for (const [name, bound] of [['latitude', 90], ['longitude', 180]]) if (result[name] != null) check(typeof result[name] === 'number' && Math.abs(result[name]) <= bound);
  for (const name of ['viirs_observed_label', 'reported_viirs_observed_label']) if (Object.hasOwn(result, name)) check(result[name] === null || result[name] === 0 || result[name] === 1);
  if (result.harmonization_score != null) check(typeof result.harmonization_score === 'number');
  if (result.model_sha256 != null && file.model_sha256 != null) check(result.model_sha256 === file.model_sha256);
  if (kind === 'model_evaluation' && result.source_acquisition != null && file.source_acquisition != null) check(result.source_acquisition === file.source_acquisition);
  result.gold_provenance = Object.fromEntries(['processing_version', 'model_sha256', 'reference_model_sha256', 'model_score_replay_verified', 'model_verification_status', 'time_policy', 'source_provenance', 'source_acquisition'].filter(key => file[key] !== undefined).map(key => [key, cleanValue(file[key])]));
  return result;
}

/** Reads committed, checksummed Gold publications using explicit backend-only read-only SAS access. */
export function createGoldReader({ env = process.env, fetchImpl = fetch, now = Date.now, readAccessFile, publication = 'morocco' } = {}) {
  const profile = profileFor(publication);
  let credential, generation = 0, cached, nextCheck = 0, refreshing;
  const tables = new Map();
  const ttl = Number(env.PROMETHEUS_GOLD_REFRESH_SECONDS || 30) * 1000;
  check(integer(ttl, 1) && ttl <= 3600000);

  async function access() {
    try {
      check(env.PROMETHEUS_GOLD_AUTH === 'sas');
      let raw;
      if (env.PROMETHEUS_GOLD_SAS_TOKEN) {
        check(!env.PROMETHEUS_GOLD_ACCESS_FILE);
        const token = env.PROMETHEUS_GOLD_SAS_TOKEN;
        raw = JSON.stringify({ account: 'stprometheusnasa', container: 'gold', sas_token: token, expires_at: new URLSearchParams(token.replace(/^\?/, '')).get('se') });
      } else if (readAccessFile) raw = await readAccessFile(env.PROMETHEUS_GOLD_ACCESS_FILE);
      else {
        check(typeof env.PROMETHEUS_GOLD_ACCESS_FILE === 'string' && env.PROMETHEUS_GOLD_ACCESS_FILE.length > 0);
        const handle = await fs.open(env.PROMETHEUS_GOLD_ACCESS_FILE, 'r');
        try {
          check((await handle.stat()).size <= 65536);
          const buffer = Buffer.alloc(65537);
          const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
          check(bytesRead <= 65536); raw = buffer.subarray(0, bytesRead);
        } finally { await handle.close(); }
      }
      check(Buffer.byteLength(raw) <= 65536);
      const parsed = JSON.parse(Buffer.from(raw).toString('utf8'));
      check(parsed.account === 'stprometheusnasa' && parsed.container === 'gold' && typeof parsed.sas_token === 'string');
      const token = parsed.sas_token.replace(/^\?/, '');
      const params = new URLSearchParams(token);
      for (const key of ['sig', 'se', 'sp']) check(params.getAll(key).length === 1);
      for (const key of ['st', 'skt', 'ske']) check(params.getAll(key).length <= 1);
      check(params.get('sig') && ['r', 'rl'].includes(params.get('sp')) && params.get('sr') === 'c' && !params.has('ss') && !params.has('srt') && (!params.get('spr') || params.get('spr') === 'https'));
      const expiry = Math.min(Date.parse(parsed.expires_at), Date.parse(params.get('se')), params.has('ske') ? Date.parse(params.get('ske')) : Infinity);
      const start = Math.max(...['st', 'skt'].map(key => params.has(key) ? Date.parse(params.get(key)) : -Infinity));
      check(Number.isFinite(expiry) && now() < expiry && (start === -Infinity || Number.isFinite(start) && start <= now()));
      const fingerprint = sha256(raw);
      if (credential?.fingerprint !== fingerprint) {
        credential = { token, expiry, fingerprint }; generation++; cached = undefined; nextCheck = 0; tables.clear(); refreshing = undefined;
      }
      return { ...credential, generation };
    } catch { throw new GoldError(); }
  }
  async function assertAccess(auth) { const current = await access(); check(current.generation === auth.generation && now() < auth.expiry); }

  async function download(blobPath, auth, { limit = 32 * 1024 * 1024, headers = {}, method = 'GET' } = {}) {
    safePath(blobPath);
    const url = new URL(blobPath.split('/').map(encodeURIComponent).join('/'), GOLD_ENDPOINT);
    url.search = auth.token;
    const response = await fetchImpl(url.href, { method, headers: { 'x-ms-version': '2023-11-03', ...headers }, redirect: 'error', signal: AbortSignal.timeout(15000) });
    if (response.status === 412) { await response.body?.cancel(); throw new GoldError(409); }
    if (response.status === 304) return { status: 304 };
    if (!response.ok) { await response.body?.cancel(); throw new GoldError(); }
    if (method === 'HEAD') return { etag: response.headers.get('etag') };
    check(Number(response.headers.get('content-length')) <= limit);
    const chunks = []; let count = 0;
    for await (const chunk of response.body) { count += chunk.byteLength; check(count <= limit); chunks.push(chunk); }
    return { bytes: Buffer.concat(chunks), etag: response.headers.get('etag') };
  }

  async function refresh(auth) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const pointer = await download(profile.pointer, auth, { limit: 1024 * 1024, headers: attempt === 0 && cached ? { 'If-None-Match': cached.pointerEtag } : {} });
        if (pointer.status === 304) { check(cached); await assertAccess(auth); nextCheck = now() + ttl; return cached; }
        check(typeof pointer.etag === 'string' && pointer.etag.length > 0);
        const publication = JSON.parse(pointer.bytes.toString('utf8'));
        check(publication.schema_version === 1 && publication.status === 'COMMITTED' && isHash(publication.catalog_sha256));
        const catalogPath = safePath(publication.catalog_path);
        check(catalogPath === `catalog/${profile.publication}/snapshots/${publication.catalog_sha256}/catalog.json`);
        const content = await download(catalogPath, auth, { limit: 4 * 1024 * 1024 });
        check(sha256(content.bytes) === publication.catalog_sha256);
        const catalog = validateGoldCatalog(JSON.parse(content.bytes.toString('utf8')), { publication: profile.publication });
        if (profile.comparison) for (const ref of catalog.source_catalogs) {
          const pinned = await download(ref.catalog_path, auth, { limit: 4 * 1024 * 1024 });
          check(sha256(pinned.bytes) === ref.catalog_sha256);
          validateGoldCatalog(JSON.parse(pinned.bytes.toString('utf8')), { publication: ref.country_iso3 === 'MAR' ? 'morocco' : 'algeria' });
        }
        const verified = await download(profile.pointer, auth, { method: 'HEAD', headers: { 'If-Match': pointer.etag } });
        if (verified.etag !== pointer.etag) throw new GoldError(409);
        await assertAccess(auth);
        if (cached?.snapshot !== publication.catalog_sha256) tables.clear();
        cached = { snapshot: publication.catalog_sha256, catalog, pointerEtag: pointer.etag, generation: auth.generation };
        nextCheck = now() + ttl;
        return cached;
      } catch (error) {
        if (error instanceof GoldError && error.status === 409 && attempt < 2) continue;
        throw error;
      }
    }
    throw new GoldError(409);
  }
  async function getSnapshot() {
    const auth = await access();
    if (!cached || now() >= nextCheck) {
      if (!refreshing) {
        const pending = refresh(auth); refreshing = pending;
        pending.finally(() => { if (refreshing === pending) refreshing = undefined; }).catch(() => {});
      }
      await refreshing;
    }
    await assertAccess(auth); check(cached?.generation === auth.generation);
    return cached;
  }
  async function readDataset(snapshot, datasetId) {
    const auth = await access(); check(auth.generation === snapshot.generation);
    const dataset = snapshot.catalog.datasets[datasetId]; check(dataset && Object.hasOwn(profile.kinds, datasetId));
    const key = `${snapshot.snapshot}:${datasetId}`;
    if (!tables.has(key)) {
      const pending = (async () => {
        const chunks = new Array(dataset.files.length);
        let nextFile = 0;
        async function readFile(file) {
          const result = await download(file.blob_path, auth, { limit: file.bytes });
          check(result.bytes.length === file.bytes && sha256(result.bytes) === file.sha256);
          const buffer = result.bytes.buffer.slice(result.bytes.byteOffset, result.bytes.byteOffset + result.bytes.byteLength);
          const metadata = parquetMetadata(buffer);
          check(BigInt(metadata.num_rows) === BigInt(file.rows));
          const names = metadata.schema.filter(field => field.type !== undefined).map(field => field.name);
          check(names.length === file.schema.length && new Set(names).size === names.length && names.every(name => file.schema.some(field => field.name === name)));
          const parsed = file.rows ? await parquetReadObjects({ file: buffer, compressors }) : []; check(parsed.length === file.rows);
          return parsed.map(row => normalizeRow(row, file, dataset.kind));
        }
        async function worker() {
          while (nextFile < dataset.files.length) {
            const index = nextFile++;
            chunks[index] = await readFile(dataset.files[index]);
          }
        }
        // Keep network work bounded and retain committed file order despite parallel reads.
        await Promise.all(Array.from({ length: Math.min(4, dataset.files.length) }, worker));
        const rows = chunks.flat();
        check(rows.length === dataset.row_count); await assertAccess(auth);
        return { snapshot: snapshot.snapshot, generation: auth.generation, rows, files_verified: dataset.files.length };
      })();
      tables.set(key, pending);
      pending.catch(() => { if (tables.get(key) === pending) tables.delete(key); });
    }
    const result = await tables.get(key); await assertAccess(auth); return result;
  }
  return { getSnapshot, readDataset, checkAccess: access };
}
