import type { Polygon, MultiPolygon, Position } from 'geojson';
import { activityDay, dailyBuckets, selectScope } from './analytics-engine.ts';
import type { FireMetadata, PreparedObservation, SensorFilter } from './analytics-model.ts';

// Spherical polygon area from the boundary rings, including islands and holes.
const radians = Math.PI / 180;
const earthRadiusKm = 6371.0088;
function ringArea(ring: Position[]) {
  let sum = 0;
  for (let i = 1; i < ring.length; i++) {
    const [lonA, latA] = ring[i - 1];
    const [lonB, latB] = ring[i];
    const delta = ((lonB - lonA + 540) % 360 - 180) * radians;
    sum += delta * (Math.sin(latA * radians) + Math.sin(latB * radians));
  }
  return Math.abs(sum) * earthRadiusKm ** 2 / 2;
}

export function boundaryAreaKm2(geometry: Polygon | MultiPolygon): number {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  return polygons.reduce((area, [outer, ...holes]) => area + ringArea(outer) - holes.reduce((sum, hole) => sum + ringArea(hole), 0), 0);
}

export function compareMonths(dates: string[], observedDays: Map<string, number>, completeDays: Set<string>) {
  const months = new Map<string, { count: number | null; complete: boolean }>();
  for (const date of dates) {
    const month = date.slice(0, 7);
    const dayCount = observedDays.get(date);
    const complete = completeDays.has(date);
    const entry = months.get(month) ?? { count: null, complete: true };
    if (dayCount !== undefined || complete) entry.count = (entry.count ?? 0) + (dayCount ?? 0);
    entry.complete &&= complete;
    months.set(month, entry);
  }
  return { months, covered: dates.filter(date => completeDays.has(date)).length };
}

export function snapshotComparison(dates: string[], rows: PreparedObservation[], metadata: FireMetadata, sensor: SensorFilter, country: string) {
  const index = dailyBuckets(selectScope(rows, { sensor, country, area: null }));
  const counts = new Map<string, number>();
  const covered = new Set<string>();
  for (const date of dates) {
    const value = activityDay(date, index, metadata, sensor, 'detections');
    if (value.value !== null) counts.set(date, value.value);
    if (value.availability === 'complete') covered.add(date);
  }
  return compareMonths(dates, counts, covered);
}
