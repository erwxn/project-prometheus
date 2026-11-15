import { VectorTile } from '@mapbox/vector-tile';
import { fromVectorTileJs } from '@maplibre/vt-pbf';
import { PbfReader } from 'pbf';

const protocol = 'prometheus-boundary://';
const [west, south, east, north] = [-17.3, 21.39, -8.55, 27.85];
const tileX = (lon: number) => (lon + 180) / 360;
const tileY = (lat: number) => (1 - Math.asinh(Math.tan(lat * Math.PI / 180)) / Math.PI) / 2;
const tilePath = /\/(\d+)\/(\d+)\/(\d+)\.pbf$/;

export function basemapRequest(url: string) {
  const match = url.startsWith('https://tiles.openfreemap.org/planet/') && url.match(tilePath);
  if (!match) return { url };
  const [z, x, y] = match.slice(1).map(Number);
  const scale = 2 ** z;
  const intersects = x + 1 >= tileX(west) * scale && x <= tileX(east) * scale
    && y + 1 >= tileY(north) * scale && y <= tileY(south) * scale;
  return { url: z < 5 && intersects ? `${protocol}${url}` : url };
}

export function hideCoarseBerm(data: ArrayBuffer, z: number, x: number, y: number): ArrayBuffer {
  const tile = new VectorTile(new PbfReader(data));
  const boundary = tile.layers.boundary;
  if (!boundary) return data;
  const scale = 2 ** z * boundary.extent;
  const minX = tileX(west) * scale - x * boundary.extent;
  const maxX = tileX(east) * scale - x * boundary.extent;
  const minY = tileY(north) * scale - y * boundary.extent;
  const maxY = tileY(south) * scale - y * boundary.extent;
  let changed = false;
  const features = Array.from({ length: boundary.length }, (_, index) => boundary.feature(index)).flatMap(feature => {
    const p = feature.properties;
    if (feature.type !== 2 || p.admin_level !== 2 || p.maritime !== 0 || p.disputed !== 0 || p.adm0_l || p.adm0_r) return [feature];
    const lines = feature.loadGeometry();
    // OpenFreeMap groups the untagged berm with outer borders at low zoom.
    // Filter individual lines so the rest of the vector-tile feature survives.
    const kept = lines.filter(line => !line.every(point => point.x > minX && point.x < maxX && point.y > minY && point.y < maxY));
    if (kept.length === lines.length) return [feature];
    changed = true;
    feature.loadGeometry = () => kept;
    return kept.length ? [feature] : [];
  });
  if (!changed) return data;
  return new Uint8Array(fromVectorTileJs({ layers: { ...tile.layers, boundary: {
    name: boundary.name, version: boundary.version, extent: boundary.extent,
    length: features.length, feature: index => features[index],
  } } })).buffer;
}

export async function loadBasemapBoundaryTile({ url }: { url: string }, controller: AbortController) {
  const original = url.slice(protocol.length);
  const coordinates = original.match(tilePath);
  const response = await fetch(original, { signal: controller.signal });
  if (!response.ok) throw new Error(`Basemap tile request failed (${response.status})`);
  const data = await response.arrayBuffer();
  if (!coordinates) return { data };
  const [z, x, y] = coordinates.slice(1).map(Number);
  try {
    return { data: hideCoarseBerm(data, z, x, y), cacheControl: response.headers.get('Cache-Control') ?? undefined };
  } catch {
    return { data };
  }
}
