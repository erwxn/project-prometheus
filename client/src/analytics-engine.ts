import type { FireFeature } from './fire-data.ts';
import { areaPredicate } from './area-selection.ts';
import { observationFrp, sensorOf, type ActivityBucket, type ActivityMetric, type DashboardFilters, type FireCollection, type FireMetadata, type PreparedObservation, type SensorFilter, type TrendPoint } from './analytics-model.ts';

export const UTC_DAY = 86_400_000;
export function validDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const value = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(value) && new Date(value).toISOString().slice(0, 10) === date;
}
export const dateTime = (date: string) => Date.parse(`${date}T00:00:00Z`);
export const isoDate = (time: number) => new Date(time).toISOString().slice(0, 10);
export function dateRangeError(start: string, end: string): string | null {
  if (!start && !end) return null;
  if (!validDate(start) || !validDate(end)) return 'Enter valid start and end dates.';
  if (start > end) return 'The start date must be on or before the end date.';
  if (dateTime(end) - dateTime(start) > UTC_DAY * 36600) return 'Choose a range of at most 100 years.';
  return null;
}

export function prepareObservations(features: FireFeature[]): PreparedObservation[] {
  return features.map(feature => {
    const value = feature.properties.observed_at_utc;
    const timestamp = value && validDate(value.slice(0, 10)) && Number.isFinite(Date.parse(value)) ? Date.parse(value) : null;
    return { feature, timestamp, date: timestamp === null ? null : isoDate(timestamp), sensor: sensorOf(feature), frp: observationFrp(feature) };
  });
}

export function datasetDateBounds(collection: FireCollection): [string, string] {
  const dates = collection.features.flatMap(f => {
    const date = f.properties.observed_at_utc?.slice(0, 10);
    return date && validDate(date) ? [date] : [];
  });
  if (collection.metadata.coverage_scope === 'global') for (const interval of collection.metadata.coverage ?? []) dates.push(interval.startDate, interval.endDate);
  dates.sort();
  return [dates[0] ?? '', dates.at(-1) ?? ''];
}

export function selectScope(rows: PreparedObservation[], filters: Pick<DashboardFilters, 'area' | 'sensor'>): PreparedObservation[] {
  const contains = areaPredicate(filters.area);
  return rows.filter(row => (filters.sensor === 'ALL' || row.sensor === filters.sensor) && contains(row.feature.geometry.coordinates));
}

export function selectRange(rows: PreparedObservation[], filters: Pick<DashboardFilters, 'startDate' | 'endDate' | 'selectedDay'>, focusDay = true): PreparedObservation[] {
  const from = focusDay && filters.selectedDay ? filters.selectedDay : filters.startDate;
  const to = focusDay && filters.selectedDay ? filters.selectedDay : filters.endDate;
  if (!from && !to) return rows;
  const start = dateTime(from), end = dateTime(to) + UTC_DAY;
  return rows.filter(row => row.timestamp !== null && row.timestamp >= start && row.timestamp < end);
}

export function dailyBuckets(rows: PreparedObservation[]): Map<string, { count: number; frpSum: number; frpCount: number; methodIds: Set<string> }> {
  const buckets = new Map<string, { count: number; frpSum: number; frpCount: number; methodIds: Set<string> }>();
  for (const row of rows) {
    if (!row.date) continue;
    const bucket = buckets.get(row.date) ?? { count: 0, frpSum: 0, frpCount: 0, methodIds: new Set<string>() };
    bucket.count++;
    if (row.frp !== null) { bucket.frpCount++; bucket.frpSum += row.frp; }
    if (row.feature.properties.method_id) bucket.methodIds.add(row.feature.properties.method_id);
    buckets.set(row.date, bucket);
  }
  return buckets;
}
export type DailyIndex = ReturnType<typeof dailyBuckets>;

function coverage(date: string, metadata: FireMetadata, sensor: SensorFilter): { status: 'complete' | 'unknown' | 'unavailable'; method: string | null } {
  if (sensor === 'ALL' || metadata.coverage_scope !== 'global') return { status: 'unknown', method: null };
  const intervals = (metadata.coverage ?? []).filter(i => i.sensor === sensor && i.startDate <= date && i.endDate >= date);
  if (intervals.some(i => i.status === 'unavailable')) return { status: 'unavailable', method: null };
  const methods = new Set(intervals.filter(i => i.status === 'complete').map(i => i.method));
  return methods.size === 1 ? { status: 'complete', method: [...methods][0] } : { status: 'unknown', method: null };
}

export function activityDay(date: string, index: DailyIndex, metadata: FireMetadata, sensor: SensorFilter, metric: ActivityMetric): ActivityBucket {
  const bucket = index.get(date) ?? { count: 0, frpSum: 0, frpCount: 0, methodIds: new Set<string>() };
  const covered = coverage(date, metadata, sensor);
  const consistent = !covered.method || !bucket.methodIds.size || (bucket.methodIds.size === 1 && bucket.methodIds.has(covered.method));
  const availability = covered.status === 'complete' && consistent ? 'complete' : bucket.count ? 'partial' : covered.status;
  const value = !bucket.count && covered.status !== 'complete' ? null : metric === 'detections' ? bucket.count : bucket.frpCount ? bucket.frpSum / bucket.frpCount : null;
  return { count: bucket.count, frpCount: bucket.frpCount, frpSum: bucket.frpSum, date, value, availability, method: consistent ? covered.method : null };
}

export function enumerateDates(start: string, end: string): string[] {
  if (!start || !end || dateRangeError(start, end)) return [];
  const dates: string[] = [];
  for (let time = dateTime(start), limit = dateTime(end); time <= limit; time += UTC_DAY) dates.push(isoDate(time));
  return dates;
}

export function summarizeRange(rows: PreparedObservation[], filters: DashboardFilters, index: DailyIndex, metadata: FireMetadata) {
  let frpSum = 0, frpCount = 0, maxFrp: number | null = null;
  const active = new Set<string>();
  for (const row of rows) {
    if (row.date) active.add(row.date);
    if (row.frp !== null) { frpSum += row.frp; frpCount++; maxFrp = Math.max(maxFrp ?? 0, row.frp); }
  }
  const dates = filters.selectedDay ? [filters.selectedDay] : enumerateDates(filters.startDate, filters.endDate);
  let peak: number | null = null;
  const peakDays: string[] = [];
  for (const date of dates) {
    const { value } = activityDay(date, index, metadata, filters.sensor, filters.metric);
    if (value === null) continue;
    if (peak === null || value > peak) { peak = value; peakDays.length = 0; peakDays.push(date); }
    else if (value === peak) peakDays.push(date);
  }
  return { count: rows.length, activeDays: dates.length ? active.size : null, meanFrp: frpCount ? frpSum / frpCount : null, frpCount, maxFrp, peak, peakDays };
}

export function anomalies(observed: number | null, baseline: number | null) {
  return {
    absoluteAnomaly: observed === null || baseline === null ? null : observed - baseline,
    percentageAnomaly: observed === null || baseline === null || baseline === 0 ? null : (observed - baseline) / baseline * 100,
  };
}

function periodBounds(key: string, grain: 'month' | 'year'): [string, string] {
  const year = Number(key.slice(0, 4)), month = grain === 'year' ? 0 : Number(key.slice(5, 7)) - 1;
  return [isoDate(Date.UTC(year, month, 1)), isoDate(Date.UTC(year, grain === 'year' ? 12 : month + 1, 0))];
}

export function historicalTrends(index: DailyIndex, metadata: FireMetadata, filters: Pick<DashboardFilters, 'startDate' | 'endDate' | 'sensor' | 'metric'>, grain: 'month' | 'year'): TrendPoint[] {
  if (!filters.startDate || !filters.endDate || filters.sensor === 'ALL' || dateRangeError(filters.startDate, filters.endDate)) return [];
  const cache = new Map<string, { count: number; value: number | null; complete: boolean; method: string | null }>();
  const aggregate = (key: string, size: 'month' | 'year') => {
    const cacheKey = `${key}:${size}`;
    if (cache.has(cacheKey)) return cache.get(cacheKey)!;
    const [start, end] = periodBounds(key, size);
    let count = 0, sum = 0, frpCount = 0, complete = true;
    const methods = new Set<string>();
    for (const date of enumerateDates(start, end)) {
      const day = activityDay(date, index, metadata, filters.sensor, filters.metric);
      count += day.count; sum += day.frpSum; frpCount += day.frpCount;
      if (day.availability !== 'complete') complete = false;
      if (day.method) methods.add(day.method);
    }
    const result = { count, value: !count && !complete ? null : filters.metric === 'detections' ? count : frpCount ? sum / frpCount : null, complete: complete && methods.size === 1, method: methods.size === 1 ? [...methods][0] : null };
    cache.set(cacheKey, result);
    return result;
  };
  const keys = new Set(enumerateDates(filters.startDate, filters.endDate).map(date => date.slice(0, grain === 'month' ? 7 : 4)));
  return [...keys].map(key => {
    const [start, end] = periodBounds(key, grain);
    const full = aggregate(key, grain);
    const clippedStart = start < filters.startDate ? filters.startDate : start, clippedEnd = end > filters.endDate ? filters.endDate : end;
    let value = full.value, count = full.count;
    const complete = full.complete && clippedStart === start && clippedEnd === end;
    if (clippedStart !== start || clippedEnd !== end) {
      const days = enumerateDates(clippedStart, clippedEnd).map(date => activityDay(date, index, metadata, filters.sensor, filters.metric));
      count = days.reduce((n, day) => n + day.count, 0);
      const frpCount = days.reduce((n, day) => n + day.frpCount, 0);
      value = filters.metric === 'detections' ? (count || days.every(day => day.availability === 'complete') ? count : null) : frpCount ? days.reduce((n, day) => n + day.frpSum, 0) / frpCount : null;
    }
    const year = Number(key.slice(0, 4));
    const references = [year - 3, year - 2, year - 1];
    const annual = references.map(year => aggregate(String(year), 'year'));
    const samples = references.map(year => aggregate(`${year}${key.slice(4)}`, grain));
    const comparable = complete && full.method !== null && annual.every(a => a.complete && a.method === full.method) && samples.every(s => s.value !== null);
    const baseline = comparable ? samples.reduce((n, s) => n + s.value!, 0) / 3 : null;
    return { date: key, count, value, complete, baseline, ...anomalies(value, baseline), baselineReason: comparable ? `Mean of ${references.join(', ')} · same sensor and method` : !complete ? 'Selected period lacks complete comparable coverage.' : 'Three preceding complete years with a consistent product/method are required.' };
  });
}
