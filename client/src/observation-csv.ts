import type { FireMetadata } from './analytics-model';
import type { FireFeature } from './fire-data';

const columns = [
  'latitude', 'longitude', 'observed_at_utc', 'acq_time_utc', 'satellite',
  'platform', 'confidence', 'confidence_percent', 'raw_frp_mw',
  'harmonized_frp_mw', 'dataset_source', 'dataset_name', 'dataset_version',
  'product_version', 'method_id',
];

function field(value: string | number | null | undefined) {
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  if (!value) return '';
  const safe = /^[\s\uFEFF]*[=+@-]|^[\t\r\n]/u.test(value) ? "'" + value : value;
  return '"' + safe.replaceAll('"', '""') + '"';
}

export function observationCsv(fires: readonly FireFeature[], metadata: FireMetadata) {
  const lines = fires.map(({ geometry, properties: p }) => [
    geometry.coordinates[1], geometry.coordinates[0], p.observed_at_utc, p.acq_time_utc,
    p.satellite, p.platform, p.confidence, p.confidence_percent, p.raw_frp,
    p.normalized_frp, metadata.source, metadata.source_name, metadata.version,
    p.product_version, p.method_id,
  ].map(field).join(','));
  return [columns.join(','), ...lines].join('\r\n') + '\r\n';
}
