import { activityDay, dailyBuckets, dateTime, enumerateDates, isoDate, prepareObservations, selectScope, UTC_DAY, validDate } from './analytics-engine.ts';
import type { AreaFeature, FireCollection } from './analytics-model.ts';
import type { ArchiveSummary } from './archive-model.ts';

export interface MonitorWeek { year: number; startDate: string; endDate: string }
export interface MonitorWeekResult {
  count: number | null;
  coverage: 'complete' | 'partial' | 'unknown';
  observedDays: number;
  method?: string;
}

export function monitorWeeks(latestCompletedDate: string) {
  const year = Number(latestCompletedDate.slice(0, 4));
  return Array.from({ length: 4 }, (_, offset) => {
    const endDate = `${year - offset}${latestCompletedDate.slice(4)}`;
    return { year: year - offset, week: validDate(endDate) ? {
      year: year - offset, startDate: isoDate(dateTime(endDate) - 6 * UTC_DAY), endDate,
    } : null };
  });
}

export function harmonizedWeeks(collection: FireCollection, area: AreaFeature | null, weeks: ReturnType<typeof monitorWeeks>) {
  const index = dailyBuckets(selectScope(prepareObservations(collection.features), { area, sensor: 'Harmonized' }));
  return weeks.map(({ week }): MonitorWeekResult | null => {
    if (!week) return null;
    const days = enumerateDates(week.startDate, week.endDate).map(date => activityDay(date, index, collection.metadata, 'Harmonized', 'detections'));
    const observedDays = days.filter(day => day.count > 0).length;
    const count = days.reduce((sum, day) => sum + day.count, 0);
    const methods = new Set(days.map(day => day.method));
    const method = methods.size === 1 ? days[0]?.method : null;
    if (method && days.every(day => day.availability === 'complete')) return { count, observedDays, coverage: 'complete', method };
    return { count: count || null, observedDays, coverage: count ? 'partial' : 'unknown' };
  });
}

export function recordedWeek(summary: ArchiveSummary): MonitorWeekResult {
  const count = summary.totals.count;
  return { count: count || null, observedDays: summary.daily.filter(day => day.count > 0).length, coverage: 'unknown' };
}
