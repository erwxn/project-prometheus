import type { Feature, Polygon } from 'geojson';
import type { FireFeature } from './fire-data.ts';

export const SENSOR_IDS = ['MODIS', 'VIIRS', 'Harmonized'] as const;
export type Sensor = typeof SENSOR_IDS[number];
export type SensorFilter = Sensor | 'ALL';
export const SIMULATED_PLATFORMS = { MODIS: ['Terra', 'Aqua'], VIIRS: ['Suomi NPP', 'NOAA-20', 'NOAA-21'], Harmonized: [] } as const;
export type SimulatedPlatform = (typeof SIMULATED_PLATFORMS)[Sensor][number];
export type ActivityMetric = 'detections' | 'mean-frp';
export type AreaFeature = Feature<Polygon, { kind: 'rectangle' | 'polygon' | 'radius'; center?: [number, number]; radiusKm?: number }>;
export type DrawMode = 'static' | 'rectangle' | 'polygon' | 'select';

// Complete intervals must describe the whole spatial scope, not merely the
// interval between the first and last hotspot in a detection-only CSV.
export interface CoverageInterval {
  sensor: Sensor;
  startDate: string;
  endDate: string;
  status: 'complete' | 'unavailable';
  method: string;
}

export interface FireMetadata {
  gold?: boolean;
  gold_sensor?: SensorFilter;
  gold_snapshot?: string;
  gold_page?: number;
  gold_pages?: number;
  country_iso3?: string;
  delivery_format?: string;
  record_unit?: 'predicted_cell' | 'fire_group' | 'model_candidate';
  preview?: boolean;
  candidate_cells?: number;
  predicted_cells?: number;
  fire_groups?: number;
  group_frp_total_mw?: number;
  selection_rule?: string;
  limitations?: string[];
  validation?: Record<string, unknown>;
  source: string;
  live?: boolean;
  version?: string;
  feed_status?: 'current' | 'stale';
  temporary?: boolean;
  archive?: boolean;
  archive_platform?: string;
  archive_year?: string;
  archive_month?: string;
  archive_startDate?: string;
  archive_endDate?: string;
  archive_sensor?: SensorFilter;
  indexed_total?: number;
  partition_total?: number;
  test_platform?: string;
  test_month?: string;
  test_page?: number;
  test_pages?: number;
  source_name?: string;
  observed_from?: string;
  observed_to?: string;
  solar_time_basis?: string;
  local_solar_dates?: string[];
  rejected_rows?: number;
  uploaded?: boolean;
  total_features?: number;
  has_harmonized?: boolean;
  coverage_scope?: 'global';
  coverage?: CoverageInterval[];
}

export interface FireCollection {
  type: 'FeatureCollection';
  features: FireFeature[];
  metadata: FireMetadata;
}

export interface DashboardFilters {
  country?: string | null;
  simulatedPlatform?: SimulatedPlatform | null;
  area: AreaFeature | null;
  startDate: string;
  endDate: string;
  sensor: SensorFilter;
  metric: ActivityMetric;
  selectedDay: string | null;
}

export interface PreparedObservation {
  feature: FireFeature;
  date: string | null;
  timestamp: number | null;
  sensor: Sensor | null;
  frp: number | null;
}

export type Availability = 'complete' | 'partial' | 'unknown' | 'unavailable';
export interface ActivityBucket {
  date: string;
  count: number;
  frpCount: number;
  frpSum: number;
  value: number | null;
  availability: Availability;
  method: string | null;
}

export interface TrendPoint {
  date: string;
  count: number;
  value: number | null;
  complete: boolean;
  baseline: number | null;
  absoluteAnomaly: number | null;
  percentageAnomaly: number | null;
  baselineReason: string;
}

export function sensorOf(feature: FireFeature): Sensor | null {
  return SENSOR_IDS.find(sensor => feature.properties.satellite?.toLowerCase().includes(sensor.toLowerCase())) ?? null;
}

export function observationFrp(feature: FireFeature): number | null {
  const value = sensorOf(feature) === 'Harmonized' ? feature.properties.normalized_frp : feature.properties.raw_frp;
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

export function availableSensors(collection: FireCollection): Sensor[] {
  const available = new Set(collection.features.map(sensorOf));
  if (collection.metadata.has_harmonized) available.add('Harmonized');
  if (collection.metadata.coverage_scope === 'global') for (const interval of collection.metadata.coverage ?? []) available.add(interval.sensor);
  return SENSOR_IDS.filter(sensor => available.has(sensor));
}

export const metricLabel = (metric: ActivityMetric, unit?: FireMetadata['record_unit']) => metric === 'detections' ? unit === 'model_candidate' ? 'Model candidate cells' : unit === 'predicted_cell' ? 'Predicted cells' : unit === 'fire_group' ? 'Fire groups' : 'Hotspot detections' : 'Mean FRP';
export const metricUnit = (metric: ActivityMetric, unit?: FireMetadata['record_unit']) => metric === 'detections' ? unit === 'model_candidate' ? 'candidate cells' : unit === 'predicted_cell' ? 'predicted cells' : unit === 'fire_group' ? 'fire groups' : 'detections' : 'MW';
