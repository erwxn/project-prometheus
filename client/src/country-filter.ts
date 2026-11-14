import boundaries from '../../shared/countries.json' with { type: 'json' };
import { booleanPointInPolygon } from '@turf/boolean-point-in-polygon';
import type { Feature, Polygon, MultiPolygon } from 'geojson';

export const countryBoundaries = boundaries as unknown as Record<string, Feature<Polygon | MultiPolygon, {name:string; aliases:string[]}>>;
export function countryCode(aliases: string[]) {
  return Object.entries(countryBoundaries).find(([, feature]) => aliases.some(alias => feature.properties.aliases.includes(alias)))?.[0] ?? null;
}
export function countryName(code: string) { return countryBoundaries[code]?.properties?.name || code; }
const boxes=Object.fromEntries(Object.entries(countryBoundaries).map(([code,f])=>{const p=f.geometry.type==='Polygon'?f.geometry.coordinates.flat():f.geometry.coordinates.flat(2);return [code,[Math.min(...p.map(x=>x[0])),Math.min(...p.map(x=>x[1])),Math.max(...p.map(x=>x[0])),Math.max(...p.map(x=>x[1]))]];}));
export function countryContains(code: string | null | undefined, coordinates: [number, number]) {
  if (!code) return true;
  const b=boxes[code];
  return !!b && coordinates[0]>=b[0] && coordinates[0]<=b[2] && coordinates[1]>=b[1] && coordinates[1]<=b[3] && booleanPointInPolygon(coordinates, countryBoundaries[code]);
}
