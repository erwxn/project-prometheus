import { SENSOR_IDS, type FireCollection, type CoverageInterval } from './analytics-model.ts';
import { enumerateDates } from './analytics-engine.ts';
import type { FireFeature } from './fire-data.ts';

let cached: FireCollection | undefined;
export function simulatedHistory(): FireCollection {
  if (cached) return cached;
  const features: FireFeature[] = [];
  const centers = [[-5.802, 35.759], [-121.46, 39.75], [-54.96, -11.85], [149.82, -33.52]];
  const coverage: CoverageInterval[] = [];
  for (const sensor of SENSOR_IDS) {
    const method = `simulated-${sensor.toLowerCase()}-v1`;
    coverage.push({ sensor, startDate: '2021-01-01', endDate: '2025-12-31', status: 'complete', method });
    for (const [startDate, endDate] of [['2021-07-10', '2021-07-20'], ['2025-08-08', '2025-08-11']]) coverage.push({ sensor, startDate, endDate, status: 'unavailable', method });
  }
  for (const [dayIndex, date] of enumerateDates('2021-01-01', '2025-12-31').entries()) {
    if (coverage.some(i => i.status === 'unavailable' && i.startDate <= date && date <= i.endDate)) continue;
    const month = Number(date.slice(5, 7));
    const year = Number(date.slice(0, 4));
    for (const [sensorIndex, sensor] of SENSOR_IDS.entries()) {
      const seasonal = Math.max(0, Math.round(2 + 2 * Math.sin((month - 4) / 12 * Math.PI * 2)));
      const count = dayIndex % 11 === 0 ? 0 : (dayIndex * 7 + sensorIndex * 3 + year) % 4 + seasonal;
      for (let j = 0; j < count; j++) {
        const center = centers[(dayIndex + j) % centers.length];
        const lng = center[0] + (((dayIndex * 13 + j * 7) % 31) - 15) / 100;
        const lat = center[1] + (((dayIndex * 11 + j * 3) % 27) - 13) / 100;
        const hour = String(10 + sensorIndex + j % 3).padStart(2, '0');
        const minute = String((dayIndex + j * 7) % 60).padStart(2, '0');
        const utc = `${date}T${hour}:${minute}:00.000Z`;
        const solar = new Date(Date.parse(utc) + lng * 4 * 60000).toISOString();
        const frp = (dayIndex + j + sensorIndex) % 11 === 0 ? null : Math.round((8 + seasonal * 13 + ((dayIndex * 19 + j * 29) % 180)) * (year === 2025 && month < 7 ? 1.2 : .85) * 10) / 10;
        features.push({ type: 'Feature', id: `simulation-${sensor}-${dayIndex}-${j}`, geometry: { type: 'Point', coordinates: [lng, lat] }, properties: { satellite: sensor, raw_frp: frp, normalized_frp: sensor === 'Harmonized' ? frp : null, acq_time_utc: `${hour}:${minute}`, observed_at_utc: utc, local_solar_date: solar.slice(0, 10), local_solar_time: solar.slice(11, 16), confidence: 'simulated', method_id: `simulated-${sensor.toLowerCase()}-v1` } });
      }
    }
  }
  cached = { type: 'FeatureCollection', features, metadata: { source: 'simulated', source_name: 'Simulated fire history · 2021–2025', observed_from: '2021-01-01T00:00:00Z', observed_to: '2025-12-31T23:59:59Z', total_features: features.length, coverage_scope: 'global', coverage, has_harmonized: true } };
  return cached;
}
