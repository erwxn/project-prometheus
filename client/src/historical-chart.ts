import { enumerateDates } from './analytics-engine.ts';
import type { ActivityMetric } from './analytics-model.ts';

export type TrendGrouping = 'daily' | 'monthly' | 'yearly';
export interface HistoricalBucket { date: string; count: number; frpSum: number; frpCount: number }

export function historicalValue(bucket: HistoricalBucket | undefined, metric: ActivityMetric): number | null {
  if (!bucket) return null;
  return metric === 'detections' ? bucket.count : bucket.frpCount ? bucket.frpSum / bucket.frpCount : null;
}

export function periodKeys(startDate: string, endDate: string, grouping: TrendGrouping): string[] {
  const length = grouping === 'daily' ? 10 : grouping === 'monthly' ? 7 : 4;
  return [...new Set(enumerateDates(startDate, endDate).map(date => date.slice(0, length)))];
}

/** Calendar-aligned keys for comparing years without manufacturing missing zeroes. */
export function alignedKeys(startDate: string, endDate: string, grouping: Exclude<TrendGrouping, 'yearly'>): string[] {
  const dates = enumerateDates(startDate, endDate);
  if (!dates.length) return [];
  if (grouping === 'monthly') {
    if (startDate.slice(0, 4) === endDate.slice(0, 4)) return [...new Set(dates.map(date => date.slice(5, 7)))];
    return Array.from({ length: 12 }, (_, month) => String(month + 1).padStart(2, '0'));
  }
  if (startDate.slice(0, 4) === endDate.slice(0, 4) && dates.length < 365) return dates.map(date => date.slice(5));
  // A leap-year reference preserves February 29 as an explicit gap for non-leap years.
  return enumerateDates('2000-01-01', '2000-12-31').map(date => date.slice(5));
}

export function valuesForYear(buckets: HistoricalBucket[], year: string | number, keys: string[], metric: ActivityMetric): (number | null)[] {
  const lookup = new Map(buckets.map(bucket => [bucket.date, bucket]));
  return keys.map(key => historicalValue(lookup.get(`${year}-${key}`), metric));
}

export function historicalLabel(key: string, grouping: TrendGrouping, aligned = false): string {
  if (grouping === 'yearly') return key;
  const iso = aligned
    ? grouping === 'daily' ? `2000-${key}` : `2000-${key}-01`
    : grouping === 'daily' ? key : `${key}-01`;
  const date = new Date(`${iso}T00:00:00Z`);
  if (!Number.isFinite(date.getTime())) return key;
  return new Intl.DateTimeFormat('en', grouping === 'daily'
    ? { month: 'short', day: 'numeric', ...(aligned ? {} : { year: 'numeric' }), timeZone: 'UTC' }
    : { month: 'short', ...(aligned ? {} : { year: 'numeric' }), timeZone: 'UTC' }).format(date);
}

export function chartTitle(grouping: TrendGrouping, metric: ActivityMetric): string {
  const prefix = `${grouping[0].toUpperCase()}${grouping.slice(1)}`;
  return metric === 'detections' ? `${prefix} Fire Detections` : `${prefix} Mean FRP`;
}
