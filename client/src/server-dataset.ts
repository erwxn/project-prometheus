import { API_BASE, type FireFeature } from './fire-data';

/** Shared API response consumed by the explorer and analytics. */
export interface ServerDataset {
  features: FireFeature[];
  metadata?: { source: string; source_name?: string; version?: string; feed_status?: string;
    last_checked_at?: string; observed_from?: string; observed_to?: string; solar_time_basis?: string;
    local_solar_dates?: string[]; rejected_rows?: number; uploaded?: boolean };
}

/** Polls shared observations without overlapping requests; cleanup aborts outstanding work. */
export function watchServerDataset(onData: (data: ServerDataset) => void, onError: () => void) {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout>;
  let controller: AbortController;
  async function load() {
    controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(`${API_BASE}/api/v1/fires`, { signal: controller.signal, cache: 'no-store' });
      if (!response.ok) throw new Error('Observation service unavailable.');
      const data = await response.json();
      if (!Array.isArray(data.features)) throw new Error('Invalid observation response.');
      if (!stopped) onData(data);
    } catch {
      if (!stopped) onError();
    } finally {
      clearTimeout(timeout);
      if (!stopped) timer = setTimeout(() => { void load(); }, 60000);
    }
  }
  void load();
  return () => { stopped = true; clearTimeout(timer); controller?.abort(); };
}

/** Describes provenance and marks a retained snapshot when refresh fails. */
export function datasetLabel(data: ServerDataset) {
  return data.metadata?.source === 'harmonized'
    ? `Harmonized results${data.metadata.feed_status === 'stale' ? ' · update unavailable; showing last valid snapshot' : ''}`
    : data.metadata?.source === 'csv' ? 'Imported MODIS snapshot' : 'Illustrative demo dataset';
}
