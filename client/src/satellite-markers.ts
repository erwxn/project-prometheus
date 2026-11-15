import type { FireFeature } from './fire-data.ts';

// One set of silhouettes feeds the map atlas and the visible legend.
export const satelliteMarkers = {
  terra: { name: 'Terra', label: 'Terra · MODIS', path: 'M12 2a10 10 0 1 0 0 20a10 10 0 1 0 0-20Z' },
  aqua: { name: 'Aqua', label: 'Aqua · MODIS', path: 'M3 3h18v18H3Z' },
  snpp: { name: 'Suomi NPP', label: 'Suomi NPP · VIIRS', path: 'M12 1 23 21H1Z' },
  n20: { name: 'NOAA-20', label: 'NOAA-20 · VIIRS', path: 'M12 1 23 12 12 23 1 12Z' },
  n21: { name: 'NOAA-21', label: 'NOAA-21 · VIIRS', path: 'M6 2h12l6 10-6 10H6L0 12Z' },
  harmonized: { name: null, label: 'Harmonized estimate', path: 'M9 2h6v7h7v6h-7v7H9v-7H2V9h7Z' },
  unknown: { name: null, label: 'Platform not supplied', path: 'M12 2a10 10 0 1 0 0 20a10 10 0 1 0 0-20Zm0 5a5 5 0 1 1 0 10a5 5 0 1 1 0-10Z' },
} as const;

type Marker = keyof typeof satelliteMarkers;
const markerIds = Object.keys(satelliteMarkers) as Marker[];
const platformIds = new Map<string, Marker>([
  ['t', 'terra'], ['terra', 'terra'], ['a', 'aqua'], ['aqua', 'aqua'],
  ['snpp', 'snpp'], ['suominpp', 'snpp'], ['npp', 'snpp'], ['snp', 'snpp'],
  ['n20', 'n20'], ['noaa20', 'n20'], ['j1', 'n20'], ['jpss1', 'n20'],
  ['n21', 'n21'], ['noaa21', 'n21'], ['j2', 'n21'], ['jpss2', 'n21'],
]);

function platformMarker(value: string | undefined) {
  return platformIds.get(value?.toLowerCase().replace(/[^a-z0-9]/g, '') ?? '');
}

export function satelliteMarker({ platform, satellite }: FireFeature['properties']): Marker {
  if (satellite.toLowerCase() === 'harmonized') return 'harmonized';
  return platformMarker(platform) ?? platformMarker(satellite) ?? 'unknown';
}

export function satelliteName(properties: FireFeature['properties']) {
  const marker = platformMarker(properties.platform) ?? platformMarker(properties.satellite);
  return (marker && satelliteMarkers[marker].name) || properties.platform?.trim() || 'Not supplied';
}

export function visibleSatelliteMarkers(features: FireFeature[]) {
  const visible = new Set(features.map(feature => satelliteMarker(feature.properties)));
  return markerIds.filter(id => visible.has(id));
}

// A masked atlas lets deck.gl preserve FRP color for every silhouette.
const slot = 28;
export const satelliteIconMapping = Object.fromEntries(markerIds.map((id, index) => [id, { x: index * slot, y: 0, width: slot, height: slot, mask: true }]));
export const satelliteIconAtlas = 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${markerIds.length * slot}" height="${slot}">${markerIds.map((id, index) => `<path transform="translate(${index * slot + 2} 2)" d="${satelliteMarkers[id].path}" fill="white" fill-rule="evenodd"/>`).join('')}</svg>`);
