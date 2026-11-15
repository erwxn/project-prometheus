import { SENSOR_IDS, SIMULATED_PLATFORMS, type FireCollection, type CoverageInterval } from './analytics-model.ts';
import { enumerateDates } from './analytics-engine.ts';
import { countryContains } from './country-filter.ts';
import type { FireFeature } from './fire-data.ts';

let cached: FireCollection | undefined;
export function simulatedHistory(): FireCollection {
  if (cached) return cached;
  const features: FireFeature[] = [];
  const regions = [
    ['MAR', -6.3, 34.5, 1.2, .8], ['MAR', -4.8, 32.8, 1.35, .95], ['MAR', -8.05, 30.9, 1.1, .85],
    ['ESP', -5.5, 37.8, 1.5, .85], ['USA', -120, 39, 1.9, 1.3], ['USA', -123, 43, 1.45, 1.2],
    ['BRA', -54, -12, 1.7, 1.45], ['BRA', -49, -16, 1.9, 1.6], ['ZAF', 27, -29, 1.8, 1.45], ['ZAF', 25, -32, 1.6, 1.0],
  ] as const;
  let seed = 2021;
  function random() {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return (seed + 1) / 4294967297;
  }
  function sampleRegion([country, longitude, latitude, width, height]: (typeof regions)[number]): [number, number] {
    // Taper point density gradually so the demo has no rectangular sampling edges.
    for (let attempt = 0; attempt < 16; attempt++) {
      const radius = Math.sqrt(-2 * Math.log(random()));
      const angle = 2 * Math.PI * random();
      const point: [number, number] = [longitude + width * radius * Math.cos(angle), latitude + height * radius * Math.sin(angle)];
      if (countryContains(country, point)) return point;
    }
    return [longitude, latitude];
  }
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
      const potential = (dayIndex * 7 + sensorIndex * 3 + year) % 4 + seasonal;
      const count = dayIndex % 11 === 0 ? 0 : Math.floor((potential + Math.floor(random() * 7)) / 7);
      for (let j = 0; j < count; j++) {
        const [lng, lat] = sampleRegion(regions[(dayIndex * 7 + j * 3 + sensorIndex) % regions.length]);
        const platforms = SIMULATED_PLATFORMS[sensor];
        const platform = platforms.length ? platforms[(dayIndex + j) % platforms.length] : undefined;
        const hour = String(10 + sensorIndex + j % 3).padStart(2, '0');
        const minute = String((dayIndex + j * 7) % 60).padStart(2, '0');
        const utc = `${date}T${hour}:${minute}:00.000Z`;
        const solar = new Date(Date.parse(utc) + lng * 4 * 60000).toISOString();
        const frp = (dayIndex + j + sensorIndex) % 11 === 0 ? null : Math.round((8 + seasonal * 13 + ((dayIndex * 19 + j * 29) % 180)) * (year === 2025 && month < 7 ? 1.2 : .85) * 10) / 10;
        features.push({ type: 'Feature', id: `simulation-${sensor}-${dayIndex}-${j}`, geometry: { type: 'Point', coordinates: [lng, lat] }, properties: { satellite: sensor, platform, raw_frp: sensor === 'Harmonized' ? null : frp, normalized_frp: sensor === 'Harmonized' ? frp : null, acq_time_utc: `${hour}:${minute}`, observed_at_utc: utc, local_solar_date: solar.slice(0, 10), local_solar_time: solar.slice(11, 16), confidence: 'simulated', method_id: `simulated-${sensor.toLowerCase()}-v1` } });
      }
    }
  }
  cached = { type: 'FeatureCollection', features, metadata: { source: 'simulated', source_name: 'Simulated fire history · 2021–2025', observed_from: '2021-01-01T00:00:00Z', observed_to: '2025-12-31T23:59:59Z', total_features: features.length, coverage_scope: 'global', coverage, has_harmonized: true } };
  return cached;
}
