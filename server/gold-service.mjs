import { createRequire } from 'node:module';
import { createGoldReader, GOLD_KINDS, GoldError } from '../deploy/backend/gold_reader.mjs';
const { validDate } = createRequire(import.meta.url)('./archive-validation.js');
const { goldExplorerFeature } = createRequire(import.meta.url)('./gold-explorer.js');
const ALLOWED = new Set(['start_date', 'end_date', 'year', 'sensor', 'source_acquisition', 'min_score', 'max_score', 'evaluation_status', 'label', 'bbox', 'page', 'page_size', 'snapshot']);
function badQuery() { throw new GoldError(400); }

/** Validates inclusive UTC filters and bounded pagination before any cloud request. */
export function parseGoldQuery(input = {}, datasetId) {
  for (const [key, value] of Object.entries(input)) if (!ALLOWED.has(key) || typeof value !== 'string') badQuery();
  if (datasetId === 'morocco_harmonization_daily_summary' && ['bbox', 'sensor', 'min_score', 'max_score'].some(key => input[key] !== undefined)) badQuery();
  if (datasetId === 'morocco_harmonized_fire_groups' && ['sensor', 'min_score', 'max_score'].some(key => input[key] !== undefined)) badQuery();
  if (input.evaluation_status !== undefined && !['morocco_model_evaluation', 'morocco_producer_reported_evaluation'].includes(datasetId)) badQuery();
  const q = {};
  for (const key of ['start_date', 'end_date']) if (input[key] !== undefined) { if (!validDate(input[key])) badQuery(); q[key] = input[key]; }
  if (q.start_date && q.end_date && q.start_date > q.end_date) badQuery();
  if (input.year !== undefined) { if (!/^\d{4}$/.test(input.year)) badQuery(); q.year = input.year; }
  for (const key of ['sensor', 'source_acquisition', 'evaluation_status']) if (input[key] !== undefined) {
    if (!input[key].trim() || input[key].length > 128) badQuery(); q[key] = input[key];
  }
  for (const key of ['min_score', 'max_score']) if (input[key] !== undefined) {
    if (datasetId === 'morocco_fire_observations' || !input[key].trim() || !Number.isFinite(Number(input[key]))) badQuery(); q[key] = Number(input[key]);
  }
  if (q.min_score !== undefined && q.max_score !== undefined && q.min_score > q.max_score) badQuery();
  if (input.label !== undefined) {
    if (!['morocco_model_evaluation', 'morocco_producer_reported_evaluation'].includes(datasetId) || !['0', '1', 'unknown'].includes(input.label)) badQuery(); q.label = input.label;
  }
  if (input.bbox !== undefined) {
    const parts = input.bbox.split(',');
    q.bbox = parts.map(Number);
    if (parts.length !== 4 || parts.some(part => !part.trim()) || q.bbox.some(value => !Number.isFinite(value)) || Math.abs(q.bbox[0]) > 180 || Math.abs(q.bbox[2]) > 180 || Math.abs(q.bbox[1]) > 90 || Math.abs(q.bbox[3]) > 90 || q.bbox[1] > q.bbox[3]) badQuery();
  }
  if (input.snapshot !== undefined) { if (!/^[a-f0-9]{64}$/.test(input.snapshot)) badQuery(); q.snapshot = input.snapshot; }
  for (const [key, fallback, maximum] of [['page', 1, 1000000000], ['page_size', 100, 1000]]) {
    if (input[key] !== undefined && !/^[1-9]\d*$/.test(input[key])) badQuery();
    q[key] = input[key] === undefined ? fallback : Number(input[key]);
    if (!Number.isSafeInteger(q[key]) || q[key] > maximum) badQuery();
  }
  return q;
}

function eligible(row, snapshot, datasetId) {
  if (row.country_iso3 !== 'MAR' || row.boundary_sha256 !== snapshot.catalog.boundary_sha256 || !row.observed_at_utc || row.observed_at_utc.startsWith('2026-')) return false;
  if (datasetId === 'morocco_harmonization_daily_summary') return true;
  return typeof row.latitude === 'number' && typeof row.longitude === 'number';
}
function filterRows(rows, q, datasetId) {
  const labelField = datasetId === 'morocco_producer_reported_evaluation' ? 'reported_viirs_observed_label' : 'viirs_observed_label';
  return rows.filter(row => {
    const day = row.observed_at_utc.slice(0, 10);
    if (q.start_date && day < q.start_date || q.end_date && day > q.end_date || q.year && !day.startsWith(q.year)) return false;
    for (const key of ['sensor', 'source_acquisition', 'evaluation_status']) if (q[key] !== undefined && row[key] !== q[key] && (key !== 'source_acquisition' || row.gold_provenance?.source_acquisition !== q[key])) return false;
    if (q.min_score !== undefined && (row.harmonization_score == null || row.harmonization_score < q.min_score)) return false;
    if (q.max_score !== undefined && (row.harmonization_score == null || row.harmonization_score > q.max_score)) return false;
    if (q.label !== undefined && (q.label === 'unknown' ? row[labelField] !== null : row[labelField] !== Number(q.label))) return false;
    if (q.bbox) {
      const [west, south, east, north] = q.bbox;
      if (row.latitude == null || row.longitude == null || row.latitude < south || row.latitude > north || (west <= east ? row.longitude < west || row.longitude > east : row.longitude < west && row.longitude > east)) return false;
    }
    return true;
  });
}

/** Recomputes metrics only for observable candidates, using catalog-documented score thresholds. */
export function goldEvaluationMetrics(rows, dataset) {
  if (!Array.isArray(dataset.metrics_by_acquisition) || !dataset.metrics_by_acquisition.length) throw new GoldError();
  const thresholds = new Map();
  for (const item of dataset.metrics_by_acquisition || []) {
    if (typeof item.source_acquisition !== 'string' || !Number.isFinite(item.metrics?.threshold) || typeof item.metrics.scope !== 'string' || !item.metrics.scope.includes('observable candidate')) throw new GoldError();
    if (thresholds.has(item.source_acquisition)) throw new GoldError();
    thresholds.set(item.source_acquisition, item.metrics.threshold);
  }
  let known = 0, unknown = 0, observableKnown = 0, missingScores = 0, tp = 0, fp = 0, tn = 0, fn = 0;
  for (const row of rows) {
    if (row.viirs_observed_label === null) { unknown++; continue; }
    known++;
    if (row.evaluation_status !== 'OBSERVABLE') continue;
    observableKnown++;
    if (row.harmonization_score === null) { missingScores++; continue; }
    const threshold = thresholds.get(row.source_acquisition);
    if (threshold === undefined) throw new GoldError();
    const positive = row.harmonization_score >= threshold;
    if (positive) { if (row.viirs_observed_label === 1) tp++; else fp++; }
    else if (row.viirs_observed_label === 1) fn++; else tn++;
  }
  const rate = (a, b) => b ? a / b : null;
  return { population: 'Selected observable candidate cells only; not national accuracy or probability calibration', filtered_rows: rows.length,
    known_labels: known, unknown_labels: unknown, observable_known_labels: observableKnown, missing_scores: missingScores, evaluated_rows: tp + fp + tn + fn,
    tp, fp, tn, fn, accuracy: rate(tp + tn, tp + fp + tn + fn), precision: rate(tp, tp + fp), recall: rate(tp, tp + fn), f1: rate(2 * tp, 2 * tp + fp + fn),
    thresholds: Object.fromEntries(thresholds), calculation: 'Recomputed from verified evaluation rows; classification thresholds supplied by the committed catalog.' };
}

/** Keeps all six Gold populations separate and invalidates query caches with catalog/access changes. */
export function createGoldService({ reader = createGoldReader() } = {}) {
  let identity;
  const cache = new Map();
  const scopedCache = new Map(), filteredCache = new Map();
  async function current(expected) {
    const snapshot = await reader.getSnapshot();
    if (expected && expected !== snapshot.snapshot) throw new GoldError(409);
    const key = `${snapshot.generation}:${snapshot.snapshot}`;
    if (identity !== key) { cache.clear(); scopedCache.clear(); filteredCache.clear(); identity = key; }
    return snapshot;
  }
  function metadata(snapshot, id) {
    const dataset = snapshot.catalog.datasets[id];
    return { source: 'Azure Gold', snapshot: snapshot.snapshot, country_iso3: 'MAR', boundary_sha256: snapshot.catalog.boundary_sha256,
      study_area: snapshot.catalog.study_area, excluded_years: [2026], dataset: id, kind: dataset.kind,
      geographic_scope: 'Committed Gold MAR country and boundary assignment; no basemap reclassification.',
      probability_calibration_established: false, score_interpretation: dataset.score_interpretation,
      ...(dataset.evidence_status ? { evidence_status: dataset.evidence_status } : {}),
      ...(dataset.provenance_note ? { provenance_note: dataset.provenance_note } : {}),
      ...(id === 'morocco_producer_reported_evaluation' ? { independently_verified: false } : {}),
      coverage_status: 'Unknown; missing records are not zero activity.' };
  }
  async function catalog(input = {}) {
    if (Object.keys(input).some(key => key !== 'snapshot') || input.snapshot !== undefined && (typeof input.snapshot !== 'string' || !/^[a-f0-9]{64}$/.test(input.snapshot))) badQuery();
    const snapshot = await current(input.snapshot);
    return { status: 'COMMITTED', schema_version: 1, snapshot: snapshot.snapshot, datasets: Object.fromEntries(Object.entries(snapshot.catalog.datasets).map(([id, dataset]) => [id, {
      ...metadata(snapshot, id), catalog_row_count: dataset.row_count, file_count: dataset.files.length,
      files: dataset.files.map(file => ({ blob_path: file.blob_path, rows: file.rows, bytes: file.bytes, sha256: file.sha256, schema: file.schema,
        processing_version: file.processing_version, model_sha256: file.model_sha256, model_verification_status: file.model_verification_status, time_policy: file.time_policy })),
    }])) };
  }
  async function query(id, input = {}, metrics = false) {
    if (!Object.hasOwn(GOLD_KINDS, id)) badQuery();
    const q = parseGoldQuery(input, id);
    const snapshot = await current(q.snapshot);
    const epoch = `${snapshot.generation}:${snapshot.snapshot}`;
    const key = `${epoch}:${id}:${metrics}:${JSON.stringify(q)}`;
    if (cache.has(key)) return cache.get(key);
    const table = await reader.readDataset(snapshot, id);
    if (table.snapshot !== snapshot.snapshot || table.generation !== snapshot.generation) throw new GoldError(409);
    const { page, page_size: pageSize, snapshot: expected, ...filters } = q;
    void expected;
    const scopedKey = `${epoch}:${id}`;
    if (!scopedCache.has(scopedKey)) {
      if (scopedCache.size >= 12) scopedCache.delete(scopedCache.keys().next().value);
      scopedCache.set(scopedKey, table.rows.filter(row => eligible(row, snapshot, id)));
    }
    const scoped = scopedCache.get(scopedKey), selectionKey = `${epoch}:${id}:${JSON.stringify(filters)}`;
    if (!filteredCache.has(selectionKey)) {
      if (filteredCache.size >= 20) filteredCache.delete(filteredCache.keys().next().value);
      filteredCache.set(selectionKey, filterRows(scoped, q, id));
    }
    const selected = filteredCache.get(selectionKey);
    const response = metrics ? { metadata: metadata(snapshot, id), filters, metrics: goldEvaluationMetrics(selected, snapshot.catalog.datasets[id]) }
      : { metadata: metadata(snapshot, id), filters, catalog_count: table.rows.length, scoped_count: scoped.length, filtered_count: selected.length,
        page, page_size: pageSize, total_pages: Math.ceil(selected.length / pageSize), data: selected.slice((page - 1) * pageSize, page * pageSize) };
    const latest = await current(snapshot.snapshot);
    if (latest.generation !== snapshot.generation) throw new GoldError(409);
    if (cache.size >= 100) cache.delete(cache.keys().next().value);
    cache.set(key, response); return response;
  }
  async function producerMetrics(input = {}) {
    if (Object.keys(input).some(key => !['year', 'snapshot'].includes(key)) || input.year !== undefined && (typeof input.year !== 'string' || !/^\d{4}$/.test(input.year))) badQuery();
    const q = parseGoldQuery(input, 'morocco_producer_reported_evaluation');
    const snapshot = await current(q.snapshot);
    const dataset = snapshot.catalog.datasets.morocco_producer_reported_evaluation;
    return { metadata: metadata(snapshot, 'morocco_producer_reported_evaluation'), independently_verified: false,
      population: 'Original delivery population; these are not metrics recomputed for the API region or a filtered subset.',
      metrics_by_year: (dataset.producer_reported_metrics_by_year || []).filter(item => item.year !== 2026 && (!q.year || String(item.year) === q.year)) };
  }
  async function explorer(input = {}) {
    if (Object.keys(input).some(key => !['sensor', 'page', 'snapshot'].includes(key)) || input.sensor !== undefined && !['Harmonized', 'MODIS', 'VIIRS'].includes(input.sensor)) badQuery();
    if (input.page !== undefined && (typeof input.page !== 'string' || !/^[1-9]\d{0,5}$/.test(input.page))) badQuery();
    if (input.snapshot !== undefined && (typeof input.snapshot !== 'string' || !/^[a-f0-9]{64}$/.test(input.snapshot))) badQuery();
    const page = Number(input.page || 1);
    const paged = result => ({ ...result, features: result.features.slice((page - 1) * 10000, page * 10000), metadata: { ...result.metadata, gold_page: page, gold_pages: Math.max(1, Math.ceil(result.features.length / 10000)) } });
    const sensor = input.sensor || 'Harmonized', model = sensor === 'Harmonized';
    const id = model ? 'morocco_harmonized_predictions' : 'morocco_fire_observations';
    const snapshot = await current(input.snapshot), key = `${snapshot.generation}:${snapshot.snapshot}:explorer:${sensor}`;
    if (cache.has(key)) return paged(cache.get(key));
    const table = await reader.readDataset(snapshot, id);
    if (table.snapshot !== snapshot.snapshot || table.generation !== snapshot.generation) throw new GoldError(409);
    const features = table.rows.filter(row => eligible(row, snapshot, id) && (model || row.sensor === sensor)).map(row => goldExplorerFeature(row, model));
    const times = features.map(feature => feature.properties.observed_at_utc).sort();
    const latest = await current(snapshot.snapshot);
    if (latest.generation !== snapshot.generation) throw new GoldError(409);
    const result = { type: 'FeatureCollection', features, metadata: {
      source: model ? 'harmonized' : 'gold', source_name: `Azure Gold · Morocco · ${model ? 'model candidates' : sensor + ' observations'}`,
      gold: true, gold_sensor: sensor, gold_snapshot: snapshot.snapshot, version: `${snapshot.snapshot}:${sensor}`,
      delivery_format: 'azure-gold', record_unit: model ? 'model_candidate' : undefined,
      has_harmonized: model, total_features: features.length, candidate_cells: model ? features.length : undefined,
      observed_from: times[0] || null, observed_to: times.at(-1) || null, feed_status: 'current',
      country_iso3: 'MAR', excluded_years: [2026], coverage_status: 'unknown',
      limitations: ['Morocco only; records dated in 2026 are excluded.', 'Model scores are uncalibrated outputs, not probabilities.', 'Missing records do not establish zero fire activity.'],
    } };
    if (cache.size >= 100) cache.delete(cache.keys().next().value);
    cache.set(key, result); return paged(result);
  }
  return { catalog, query, producerMetrics, explorer };
}
