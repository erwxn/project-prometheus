import { booleanPointInPolygon } from '@turf/boolean-point-in-polygon';
import { ValidateNotSelfIntersecting } from 'terra-draw';
import type { AreaFeature } from './analytics-model.ts';

export function validateArea(area: unknown): string | null {
  const feature = area as AreaFeature;
  if (feature?.type !== 'Feature' || feature.geometry?.type !== 'Polygon') return 'Select a polygon or rectangle.';
  const rings = feature.geometry.coordinates;
  if (!Array.isArray(rings) || rings.length !== 1) return 'Select one polygon without holes.';
  const ring = rings[0];
  if (!Array.isArray(ring) || ring.length < 4) return 'A polygon needs at least three distinct corners.';
  if (ring.some(p => !Array.isArray(p) || p.length !== 2 || !p.every(Number.isFinite) || Math.abs(p[0]) > 180 || Math.abs(p[1]) > 90)) return 'Coordinates must be longitude −180 to 180 and latitude −90 to 90.';
  if (ring[0][0] !== ring.at(-1)![0] || ring[0][1] !== ring.at(-1)![1]) return 'The polygon boundary must be closed.';
  if (ring.some((p, i) => i > 0 && Math.abs(p[0] - ring[i - 1][0]) > 180)) return 'Choose an area on one side of the date line, or draw each side separately.';
  const signedArea = ring.reduce((sum, p, i) => i ? sum + ring[i - 1][0] * p[1] - p[0] * ring[i - 1][1] : sum, 0);
  if (Math.abs(signedArea) < 1e-12) return 'The selected area must have a nonzero size.';
  if (!ValidateNotSelfIntersecting(feature).valid) return 'Polygon edges cannot cross. Move the corners or redraw the area.';
  return null;
}

// An unfinished polygon has fewer than three corners. Validate the complete
// boundary at finish, rather than blocking the user from adding corner two.
export function validateDrawingArea(area: unknown, context: { updateType: string }): { valid: boolean; reason?: string } {
  if (context.updateType !== 'finish') return { valid: true };
  const reason = validateArea(area);
  return reason ? { valid: false, reason } : { valid: true };
}

export function areaBounds(area: AreaFeature): [[number, number], [number, number]] {
  let west = Infinity, south = Infinity, east = -Infinity, north = -Infinity;
  for (const [lng, lat] of area.geometry.coordinates[0]) {
    west = Math.min(west, lng); east = Math.max(east, lng);
    south = Math.min(south, lat); north = Math.max(north, lat);
  }
  return [[west, south], [east, north]];
}

export function areaPredicate(area: AreaFeature | null): (coordinates: [number, number]) => boolean {
  if (!area) return () => true;
  const [[west, south], [east, north]] = areaBounds(area);
  return ([lng, lat]) => lng >= west && lng <= east && lat >= south && lat <= north && booleanPointInPolygon([lng, lat], area);
}

export function radiusArea(latitude: number, longitude: number, radiusKm: number): AreaFeature {
  if (![latitude, longitude, radiusKm].every(Number.isFinite) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180 || radiusKm <= 0 || radiusKm > 1000) throw new Error('Enter valid latitude/longitude and a radius greater than 0 and at most 1,000 km.');
  const rad = Math.PI / 180;
  const lat = latitude * rad, lng = longitude * rad, distance = radiusKm / 6371.0088;
  const ring: [number, number][] = Array.from({ length: 64 }, (_, index) => {
    const bearing = index / 64 * Math.PI * 2;
    const y = Math.asin(Math.sin(lat) * Math.cos(distance) + Math.cos(lat) * Math.sin(distance) * Math.cos(bearing));
    const x = lng + Math.atan2(Math.sin(bearing) * Math.sin(distance) * Math.cos(lat), Math.cos(distance) - Math.sin(lat) * Math.sin(y));
    return [Number(((((x / rad + 540) % 360) - 180)).toFixed(7)), Number((y / rad).toFixed(7))];
  });
  ring.push([...ring[0]]);
  const area: AreaFeature = { type: 'Feature', geometry: { type: 'Polygon', coordinates: [ring] }, properties: { kind: 'radius', center: [longitude, latitude], radiusKm } };
  const error = validateArea(area);
  if (error) throw new Error(error);
  return area;
}
