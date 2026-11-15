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

export async function loadObservations(base: string, signal: AbortSignal, request: typeof fetch = fetch, sensor: SensorFilter = 'Harmonized', previous?: FireCollection): Promise<FireCollection> {
  if (import.meta.env?.VITE_OBSERVATION_SOURCE === 'snapshot') {
    const response = await request(`${base}/api/v1/fires`, { signal });
    if (!response.ok) throw Error('Historical preview unavailable.');
    return parseCollection(await response.json());
  }
  const features: FireFeature[] = [];
  let first: FireCollection | undefined;
  for (let page = 1; ; page++) {
    const query = new URLSearchParams({ sensor: sensor === 'ALL' ? 'Harmonized' : sensor, page: String(page) });
    if (first) query.set('snapshot', first.metadata.gold_snapshot!);
    const headers: Record<string, string> = {};
    if (page === 1 && previous?.metadata.gold_sensor === sensor && previous.metadata.version) headers['If-None-Match'] = `"${previous.metadata.version}:1"`;
    const response = await request(`${base}/api/gold/explorer?${query}`, { signal, cache: 'no-store', headers });
    if (response.status === 304 && previous) return previous;
    if (response.status === 429) throw new ObservationRateLimitError(response.headers.get('Retry-After'));
    if (!response.ok) throw new Error(`Morocco Gold data could not be loaded (HTTP ${response.status}). Check the backend connection.`);
    const collection = parseCollection(await response.json());
    validateGoldPage(collection, sensor === 'ALL' ? 'Harmonized' : sensor, first?.metadata.gold_snapshot);
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
