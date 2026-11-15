import { sensorOf } from './analytics-model.ts';
import type { FireFeature } from './fire-data.ts';

type Coordinate = [number, number];

export function observationFootprint(feature: FireFeature): Coordinate[] | null {
  const { properties, geometry: { coordinates: [lon, lat] } } = feature;
  if (properties.record_unit === 'fire_group') return null;
  const sensor = sensorOf(feature);
  const modelCell = properties.record_unit === 'predicted_cell' || properties.record_unit === 'model_candidate';
  const wkt = modelCell && properties.cell_wkt?.match(/^POLYGON\s*\(\(([^()]+)\)\)$/i);
  if (wkt) {
    const ring = wkt[1].split(',').map(pair => pair.trim().split(/\s+/).map(Number));
    if (ring.length === 5 && ring.every(p => p.length === 2 && p.every(Number.isFinite)
      && Math.abs(p[0] - lon) < 0.1 && Math.abs(p[1] - lat) < 0.1)
      && ring[0][0] === ring[4][0] && ring[0][1] === ring[4][1]) return ring as Coordinate[];
  }
  const nominalKm = modelCell ? 0.5 : sensor === 'MODIS' ? 1 : sensor === 'VIIRS' ? 0.375 : 0;
  const scale = Math.cos(lat * Math.PI / 180);
  if (!nominalKm || scale < 0.01) return null;
  // shortcut: scan/track gives dimensions, use geolocated corners when published for swath orientation.
  const dimension = (value: number | undefined) => value && Number.isFinite(value) && value > 0 && value <= 20 ? value : nominalKm;
  const dx = (modelCell ? nominalKm : dimension(properties.scan_km)) / (2 * 111.32 * scale);
  const dy = (modelCell ? nominalKm : dimension(properties.track_km)) / (2 * 111.32);
  if (Math.abs(lon) + dx > 180 || Math.abs(lat) + dy > 90) return null;
  return [[lon-dx,lat-dy],[lon+dx,lat-dy],[lon+dx,lat+dy],[lon-dx,lat+dy],[lon-dx,lat-dy]];
}
