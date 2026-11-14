import { useEffect, useMemo, useState } from 'react';
import { isoDate, UTC_DAY } from './analytics-engine';
import type { AreaFeature, FireCollection, SensorFilter } from './analytics-model';
import { readArchiveResponse } from './archive-api';
import { archiveDefaults, type ArchiveCatalog, type ArchiveSummary } from './archive-model';
import { API_BASE } from './fire-data';
import { harmonizedWeeks, monitorWeeks, recordedWeek, type MonitorWeekResult } from './monitor-history';
import { matchesDataset } from './timeline';

export function useMonitorHistory(now: number, area: AreaFeature | null, collection: FireCollection | null, catalog: ArchiveCatalog | null) {
  const lastDay = isoDate(now - UTC_DAY);
  const weeks = useMemo(() => monitorWeeks(lastDay), [lastDay]);
  const harmonized = useMemo(() => collection && (collection.features.some(feature => matchesDataset(feature, 'Harmonized') && feature.properties.observed_at_utc)
    || collection.metadata.coverage_scope === 'global' && collection.metadata.coverage?.some(interval => interval.sensor === 'Harmonized')) ? collection : null, [collection]);
  const platform = !harmonized && catalog?.partitions.length ? archiveDefaults(catalog, collection?.metadata.test_platform).platform : null;
  const source = harmonized ? 'Harmonized' : platform;
  const local = useMemo(() => harmonized ? harmonizedWeeks(harmonized, area, weeks) : null, [harmonized, area, weeks]);
  const [remote, setRemote] = useState<{ key: string; results: (MonitorWeekResult | null | 'error')[] } | null>(null);
  const key = JSON.stringify([platform, lastDay, area]);
  useEffect(() => {
    if (!platform) return;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 20000);
    let disposed = false;
    const queries = weeks.map(async ({ week }) => {
      if (!week) return null;
      try {
        const response = await fetch(`${API_BASE}/api/v1/fires/archive/summary`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
          body: JSON.stringify({ platform, startDate: week.startDate, endDate: week.endDate, area }),
        });
        return recordedWeek(await readArchiveResponse<ArchiveSummary>(response));
      } catch { return 'error' as const; }
    });
    void Promise.all(queries).then(results => { if (!disposed) setRemote({ key, results }); })
      .finally(() => window.clearTimeout(timeout));
    return () => { disposed = true; window.clearTimeout(timeout); controller.abort(); };
  }, [area, key, platform, weeks]);

  const dated = collection && collection.features.some(feature => Number.isFinite(Date.parse(feature.properties.observed_at_utc || '')));
  const fallbackSensor: SensorFilter = collection?.features.some(feature => matchesDataset(feature, 'VIIRS')) &&
    !collection.features.some(feature => matchesDataset(feature, 'MODIS')) ? 'VIIRS' : 'ALL';
  return { weeks, source, platform, results: local ?? (remote?.key === key ? remote.results : null),
    calendarCollection: harmonized ?? (dated ? collection : null), calendarSensor: harmonized ? 'Harmonized' as const : fallbackSensor };
}
