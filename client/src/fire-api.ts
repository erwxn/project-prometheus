import type { FireCollection, FireMetadata } from './analytics-model.ts';
import { SENSOR_IDS } from './analytics-model.ts';
import { validDate } from './analytics-engine.ts';
import type { FireFeature } from './fire-data.ts';
import type { SensorFilter } from './analytics-model.ts';
import { validateGoldPage } from './gold-feed.ts';

export function parseCollection(data: unknown): FireCollection {
  const collection = data as FireCollection;
  if (collection?.type !== 'FeatureCollection' || !Array.isArray(collection.features)) throw new Error('The API returned an invalid observation collection.');
  const valid = (f: FireFeature) => f?.type === 'Feature' && f.geometry?.type === 'Point' && Array.isArray(f.geometry.coordinates) && f.geometry.coordinates.length === 2 && f.geometry.coordinates.every(Number.isFinite) && Math.abs(f.geometry.coordinates[0]) <= 180 && Math.abs(f.geometry.coordinates[1]) <= 90 && typeof f.properties?.satellite === 'string';
  if (!collection.features.every(valid)) throw new Error('The API returned invalid observation coordinates or properties.');
  const metadata: FireMetadata = { ...collection.metadata, source: typeof collection.metadata?.source === 'string' ? collection.metadata.source : 'unknown' };
  if (metadata.coverage && (!Array.isArray(metadata.coverage) || !metadata.coverage.every(i => SENSOR_IDS.includes(i.sensor) && validDate(i.startDate) && validDate(i.endDate) && i.startDate <= i.endDate && ['complete', 'unavailable'].includes(i.status) && typeof i.method === 'string' && i.method.length > 0))) throw new Error('The API returned invalid coverage metadata.');
  return { type: 'FeatureCollection', features: collection.features, metadata };
}

export function validateUpload(file: Pick<File, 'name' | 'size'>, harmonized = false): string | null {
  if (harmonized ? !/\.(csv|json|parquet|zip)$/i.test(file.name) : !file.name.toLowerCase().endsWith('.csv')) return harmonized ? 'Choose a team delivery ZIP or a harmonized CSV, JSON, or Parquet file.' : 'Choose a NASA FIRMS MODIS .csv file.';
  if (file.size === 0) return 'This file is empty.';
  if (file.size > 3 * 1024 * 1024) return 'Choose a file no larger than 3 MB for this testing tool.';
  return null;
}

export class ObservationRateLimitError extends Error {
  readonly retryAt: number;

  constructor(retryAfter: string | null) {
    super('The observation API reached its request limit. Refresh will resume after the cooldown.');
    const now = Date.now();
    const value = retryAfter?.trim() ?? '';
    const delay = /^\d+$/.test(value) ? Number(value) * 1000 : Date.parse(value) - now;
    this.retryAt = now + (Number.isFinite(delay) ? Math.max(1000, Math.min(delay, 15 * 60_000)) : 15 * 60_000);
  }
}

export async function loadObservations(base: string, signal: AbortSignal, request: typeof fetch = fetch, sensor: SensorFilter = 'Harmonized', previous?: FireCollection, country: 'MAR' | 'DZA' = 'MAR', snapshot?: string): Promise<FireCollection> {
  if (import.meta.env?.VITE_OBSERVATION_SOURCE === 'snapshot') {
    const response = await request(`${base}/api/v1/fires`, { signal });
    if (!response.ok) throw Error('Historical preview unavailable.');
    return parseCollection(await response.json());
  }
  if (country === 'DZA') return loadAlgeriaPredictions(base, signal, request, previous);
  const features: FireFeature[] = [];
  let first: FireCollection | undefined;
  for (let page = 1; ; page++) {
    const query = new URLSearchParams({ sensor: sensor === 'ALL' ? 'Harmonized' : sensor, page: String(page) });
    const expectedSnapshot = first?.metadata.gold_snapshot ?? snapshot;
    if (expectedSnapshot) query.set('snapshot', expectedSnapshot);
    const headers: Record<string, string> = {};
    if (!snapshot && page === 1 && previous?.metadata.gold_sensor === sensor && previous.metadata.version) headers['If-None-Match'] = `"${previous.metadata.version}:1"`;
    const response = await request(`${base}/api/gold/explorer?${query}`, { signal, cache: 'no-store', headers });
    if (response.status === 304 && previous) return previous;
    if (response.status === 429) throw new ObservationRateLimitError(response.headers.get('Retry-After'));
    if (!response.ok) throw new Error(`Morocco Gold data could not be loaded (HTTP ${response.status}). Check the backend connection.`);
    const collection = parseCollection(await response.json());
    validateGoldPage(collection, sensor === 'ALL' ? 'Harmonized' : sensor, expectedSnapshot);
    if (collection.metadata.gold_page !== page || first && collection.metadata.total_features !== first.metadata.total_features) throw Error('Morocco Gold publication changed during download. Retry the source.');
    first ??= collection;
    features.push(...collection.features);
    if (page >= collection.metadata.gold_pages!) break;
  }
  if (features.length !== first!.metadata.total_features) throw Error('Morocco Gold download is incomplete. Retry the source.');
  return { ...first!, features };
}

export async function uploadObservations(base: string, file: File, signal: AbortSignal, request: typeof fetch = fetch): Promise<FireCollection> {
  const error = validateUpload(file);
  if (error) throw new Error(error);
  const response = await request(`${base}/api/v1/fires/upload`, { method: 'POST', headers: { 'Content-Type': 'text/csv; charset=utf-8', 'X-CSV-Filename': encodeURIComponent(file.name) }, body: file, signal });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(typeof data?.error === 'string' ? data.error : `Upload failed (HTTP ${response.status}).`);
  const collection = parseCollection(data);
  if (!collection.features.length || collection.metadata.source !== 'csv') throw new Error('No valid MODIS observations were returned.');
  return collection;
}

export async function uploadHarmonized(base: string, file: File, signal: AbortSignal): Promise<FireCollection> {
  const error = validateUpload(file, true);
  if (error) throw new Error(error);
  const format = file.name.split('.').at(-1)!.toLowerCase();
  const response = await fetch(`${base}/api/v1/fires/upload-harmonized?format=${format}`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: file, signal });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(typeof data?.error === 'string' ? data.error : `Harmonized upload failed (HTTP ${response.status}).`);
  const collection = parseCollection(data);
  if (collection.metadata.source !== 'harmonized') throw new Error('No valid harmonized results were returned.');
  collection.metadata.source_name = file.name;
  return collection;
}

// Shared by server fetch, upload, and demo switches. A late network response
// must never replace a newer upload or an explicitly selected demo.
export class DatasetRequests {
  private revision = 0;
  private controller: AbortController | null = null;
  begin() {
    this.cancel();
    this.controller = new AbortController();
    return { revision: this.revision, controller: this.controller };
  }
  current(revision: number) { return revision === this.revision; }
  cancel() { this.revision++; this.controller?.abort(); this.controller = null; }
}


/** Loads every Algeria page atomically from the existing predictions API, never a Morocco fallback. */
async function loadAlgeriaPredictions(base: string, signal: AbortSignal, request: typeof fetch, previous?: FireCollection): Promise<FireCollection> {
  const features: FireFeature[] = [];
  let snapshot = '', total = -1, pollEtag: string | undefined;
  for (let page = 1; ; page++) {
    const query = new URLSearchParams({ country: 'DZA', year: '2015', page_size: '1000', page: String(page), ...(snapshot ? { snapshot } : {}) });
    const headers: Record<string,string> = {};
    if (page === 1 && previous?.metadata.country_iso3 === 'DZA' && previous.metadata.gold_poll_etag) headers['If-None-Match'] = previous.metadata.gold_poll_etag;
    const response = await request(`${base}/api/model-predictions?${query}`, { signal, cache: 'no-store', headers });
    if (response.status === 304 && previous?.metadata.country_iso3 === 'DZA') return previous;
    if (page === 1) pollEtag = response.headers.get('ETag') || undefined;
    if (response.status === 429) throw new ObservationRateLimitError(response.headers.get('Retry-After'));
    if (!response.ok) throw Error(`Algeria Gold data could not be loaded (HTTP ${response.status}).`);
    const body = await response.json();
    if (body.metadata?.country_iso3 !== 'DZA' || body.metadata.dataset !== 'algeria_harmonized_predictions' || !/^[a-f0-9]{64}$/.test(body.metadata.snapshot) || !Array.isArray(body.data) || body.page !== page || !Number.isSafeInteger(body.filtered_count) || body.filtered_count < 0 || body.filtered_count > 250000 || !Number.isSafeInteger(body.total_pages) || body.total_pages < 0 || body.total_pages > 250) throw Error('Invalid Algeria prediction response.');
    snapshot ||= body.metadata.snapshot;
    if (total === -1) total = body.filtered_count;
    if (snapshot !== body.metadata.snapshot || total !== body.filtered_count) throw Error('Algeria publication changed during download. Retry.');
    for (const row of body.data) {
      if (row.country_iso3 !== 'DZA' || typeof row.observed_at_utc !== 'string' || !row.observed_at_utc.startsWith('2015-') || !Number.isFinite(Date.parse(row.observed_at_utc)) || !Number.isFinite(row.latitude) || Math.abs(row.latitude) > 90 || !Number.isFinite(row.longitude) || Math.abs(row.longitude) > 180 || row.harmonization_score !== null && !Number.isFinite(row.harmonization_score)) throw Error('Invalid Algeria candidate row.');
      const solar = new Date(Date.parse(row.observed_at_utc) + row.longitude * 240000).toISOString();
      features.push({ type: 'Feature', id: row.record_id, geometry: { type: 'Point', coordinates: [row.longitude, row.latitude] }, properties: {
        satellite: 'Harmonized', platform: row.satellite || row.sensor, country_iso3: 'DZA', gold_verified: true,
        observed_at_utc: row.observed_at_utc, acq_time_utc: row.observed_at_utc.slice(11,16), local_solar_date: solar.slice(0,10), local_solar_time: solar.slice(11,16),
        raw_frp: null, normalized_frp: row.frp_cell_mw ?? null, confidence: 'Not supplied', record_unit: 'model_candidate',
        harmonization_score: row.harmonization_score, model_version: row.model_version, model_verification_status: row.model_verification_status,
      } });
    }
    if (page >= body.total_pages) break;
  }
  if (features.length !== total) throw Error('Algeria download is incomplete. Retry.');
  const dates = features.map(feature => feature.properties.observed_at_utc!).sort();
  const collection: FireCollection = { type: 'FeatureCollection', features, metadata: { source: 'harmonized', source_name: 'Azure Gold · Algeria · Model B candidate scores',
    gold: true, country_iso3: 'DZA', gold_sensor: 'Harmonized', gold_snapshot: snapshot, gold_poll_etag: pollEtag, version: `${snapshot}:Harmonized`, gold_page: 1, gold_pages: 1,
    total_features: total, candidate_cells: total, record_unit: 'model_candidate', has_harmonized: true, delivery_format: 'azure-gold', feed_status: 'current',
    observed_from: dates[0], observed_to: dates.at(-1), limitations: ['Uncalibrated Model B candidate scores, not confirmed fires or probabilities.', 'Unknown coverage; no national fire-rate or independent-accuracy inference.'] } };
  validateGoldPage(collection, 'Harmonized', undefined, 'DZA');
  return parseCollection(collection);
}
