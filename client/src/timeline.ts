export type TimeBasis = 'utc' | 'solar';
export const MINUTE = 60_000;
export const DAY = 1440 * MINUTE;
export const STEP_MINUTES = 15;
export interface TimedObservation {
  properties: { observed_at_utc?: string; acq_time_utc: string; local_solar_time: string; local_solar_date?: string; satellite: string };
}

// Clock-only demo observations have no invented acquisition date: anchor internally
// to epoch midnight and label the UI as undated. CSV records retain real dates.
export function observationTime(feature: TimedObservation, basis: TimeBasis): number {
  const p = feature.properties;
  if (basis === 'utc' && p.observed_at_utc) return Date.parse(p.observed_at_utc);
  const clock = basis === 'utc' ? p.acq_time_utc : p.local_solar_time;
  const date = basis === 'solar' ? p.local_solar_date : undefined;
  if (!/^\d{2}:\d{2}$/.test(clock)) return NaN;
  const [hour, minute] = clock.split(':').map(Number);
  if (hour > 23 || minute > 59) return NaN;
  return Date.parse(`${date || '1970-01-01'}T${clock}:00Z`);
}

export function defaultWindowStart(features: TimedObservation[], basis: TimeBasis): number {
  if (!features.some(f => f.properties.observed_at_utc)) return 0;
  if (basis === 'solar') {
    // Use the latest acquisition's UTC date as an explicit starting solar date.
    const latest = Math.max(...features.map(f => observationTime(f, 'utc')).filter(Number.isFinite));
    return Math.floor(latest / DAY) * DAY;
  }
  const times = features.map(f => observationTime(f, basis)).filter(Number.isFinite);
  if (!times.length) return 0;
  // Exclusive endpoint one minute after the last observation includes that record.
  return Math.floor(Math.max(...times) / MINUTE) * MINUTE + MINUTE - DAY;
}

export function matchesDataset(feature: TimedObservation, dataset: string): boolean {
  return dataset === 'ALL' || feature.properties.satellite.toLowerCase().includes(dataset.toLowerCase());
}

export function fileWindow(features: TimedObservation[], basis: TimeBasis): { start: number; durationMinutes: number } {
  const times = features.map(feature => observationTime(feature, basis)).filter(Number.isFinite);
  if (!times.length) return { start: 0, durationMinutes: 1440 };
  const start = Math.floor(Math.min(...times) / MINUTE) * MINUTE;
  const end = Math.floor(Math.max(...times) / MINUTE) * MINUTE + MINUTE;
  return { start, durationMinutes: Math.max(1, (end - start) / MINUTE) };
}

export function matchesTime(time: number, start: number, cursor: number, allHours: boolean, durationMinutes = 1440): boolean {
  const end = start + (allHours ? durationMinutes : cursor) * MINUTE;
  const from = allHours ? start : Math.max(start, end - 60 * MINUTE);
  return Number.isFinite(time) && time >= from && time < end;
}

export function nextDetectionMinute(times: number[], start: number, cursor: number, durationMinutes = 1440): number | null {
  const end = start + durationMinutes * MINUTE;
  const cursorTime = start + cursor * MINUTE;
  let first: number | undefined;
  let upcoming: number | undefined;
  // Scan once instead of sorting all observations on each playback tick.
  for (const time of times) {
    if (!Number.isFinite(time) || time < start || time >= end) continue;
    if (first === undefined || time < first) first = time;
    if (time >= cursorTime && (upcoming === undefined || time < upcoming)) upcoming = time;
  }
  const next = upcoming ?? first;
  if (next === undefined) return null;
  // Move to the first step whose exclusive right edge includes the observation.
  return Math.min(durationMinutes, (Math.floor((next - start) / (STEP_MINUTES * MINUTE)) + 1) * STEP_MINUTES);
}
