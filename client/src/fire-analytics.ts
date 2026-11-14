import { type FireFeature } from './fire-data';
import { DAY, matchesDataset, observationTime, type TimeBasis } from './timeline.ts';

export const sensors = [
  { id: 'MODIS', label: 'MODIS' },
  { id: 'VIIRS', label: 'VIIRS' },
  { id: 'Harmonized', label: 'Harmonized estimates' },
] as const;

export function summarizeObservations(features: FireFeature[], source: string, date: string, basis: TimeBasis) {
  const hours = Array<number>(24).fill(0);
  const sources = [...sensors.map(sensor => ({ label: sensor.label, count: 0 })), { label: 'Other', count: 0 }];
  const bands = [{ label: 'Below 50 MW', count: 0 }, { label: '50–150 MW', count: 0 }, { label: 'Above 150 MW', count: 0 }];
  const readings: { feature: FireFeature; frp: number; label: string }[] = [];
  let count = 0;
  let totalFrp = 0;
  let timedCount = 0;

  for (const feature of features) {
    if (!matchesDataset(feature, source) || (date && feature.properties.observed_at_utc?.slice(0, 10) !== date)) continue;
    count += 1;
    const time = observationTime(feature, basis);
    if (Number.isFinite(time)) {
      const hour = Math.floor(((time % DAY + DAY) % DAY) / 3_600_000);
      hours[hour] += 1;
      timedCount += 1;
    }
    const sensorIndex = sensors.findIndex(sensor => matchesDataset(feature, sensor.id));
    const bucket = sources[sensorIndex < 0 ? sensors.length : sensorIndex];
    bucket.count += 1;

    const frp = matchesDataset(feature, 'Harmonized') ? feature.properties.normalized_frp : feature.properties.raw_frp;
    if (typeof frp !== 'number' || !Number.isFinite(frp) || frp < 0) continue;
    totalFrp += frp;
    bands[frp < 50 ? 0 : frp <= 150 ? 1 : 2].count += 1;
    readings.push({ feature, frp, label: bucket.label });
  }

  const peakHourCount = Math.max(...hours);
  const peakHours = hours.flatMap((value, hour) => peakHourCount > 0 && value === peakHourCount ? [hour] : []);
  readings.sort((a, b) => b.frp - a.frp);

  return {
    count, hours, timedCount, peakHourCount, peakHours,
    sources: sources.filter(bucket => bucket.count > 0),
    bands,
    frpCount: readings.length,
    meanFrp: readings.length ? totalFrp / readings.length : null,
    peakFrp: readings[0]?.frp ?? null,
    strongest: readings.slice(0, 8),
  };
}
