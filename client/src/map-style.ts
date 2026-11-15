export interface ViewState {
  longitude: number;
  latitude: number;
  zoom: number;
  pitch: number;
  bearing: number;
}

export const INITIAL_VIEW_STATE: ViewState = {
  longitude: -6.4,
  latitude: 31.8,
  zoom: 5.2,
  pitch: 20,
  bearing: 0
};

export function getFRPColor(frp: number | null): [number, number, number, number] {
  if (frp === null) return [154, 171, 185, 210];
  if (frp < 50) return [255, 235, 59, 200];
  if (frp <= 150) return [255, 152, 0, 220];
  return [255, 45, 0, 240];
}

import type { FilterSpecification, TransformStyleFunction, SkySpecification } from 'maplibre-gl';

// Neutral vector styles keep labels crisp. Woodland fill is contextual map
// coverage, not fire data; omit it so its coverage gaps do not resemble anomalies.
export const BASEMAP_STYLES = {
  dark: 'https://tiles.openfreemap.org/styles/dark',
  light: 'https://tiles.openfreemap.org/styles/positron'
};
const showPlaceLabel: FilterSpecification = ['!', ['any',
  ['==', ['get', 'iso_a2'], 'EH'],
  ['==', ['get', 'name_en'], 'Western Sahara'],
  ['==', ['get', 'name'], 'Western Sahara'],
]];
const showBoundary: FilterSpecification = ['!', ['all',
  ['==', ['get', 'admin_level'], 2],
  ['==', ['get', 'disputed'], 1],
  ['!=', ['get', 'maritime'], 1],
  ['any',
    ['match', ['get', 'disputed_name'], ['WesternSahara', 'الصحراءالغربية-المغرب', 'Murdesécuritémarocainالجدارالأمنيالمغربي'], true, false],
    // Some OpenFreeMap tiles omit the dispute name on segments in this area.
    ['all', ['!', ['has', 'disputed_name']], ['within', {
      type: 'Polygon',
      coordinates: [[[-18.5, 20.7], [-8.4, 20.7], [-8.4, 27.9], [-18.5, 27.9], [-18.5, 20.7]]],
    }]],
  ],
]];

const ATLAS_COLORS = {
  dark: { land: '#203641', ocean: '#102534', green: '#243c43', boundary: '#607b89', waterway: '#355565', label: '#b9cbd3', halo: '#203641' },
  light: { land: '#edf0eb', ocean: '#c9dce4', green: '#e3eade', boundary: '#91a8ad', waterway: '#a8c7d4', label: '#4b626b', halo: '#f0f3ef' },
};
// Native atmosphere follows the actual globe as it rotates and zooms.
// Transparent sky lets the static star field show through beyond the limb.
export const ORBITAL_SKY: SkySpecification = {
  'sky-color': 'rgba(0,0,0,0)',
  'horizon-color': 'rgba(0,0,0,0)',
  'fog-color': 'rgba(0,0,0,0)',
  'sky-horizon-blend': 0,
  'horizon-fog-blend': 0,
  'atmosphere-blend': 0.35,
};
export const FLAT_SKY: SkySpecification = { ...ORBITAL_SKY, 'atmosphere-blend': 0 };

export const atlasBasemap = (theme: 'dark' | 'light'): TransformStyleFunction => (_previous, next) => ({
  ...next,
  layers: next.layers.filter(layer => layer.id !== 'landcover_wood').map(layer => {
    const colors = ATLAS_COLORS[theme];
    if (layer.type === 'background') return { ...layer, paint: { ...layer.paint, 'background-color': colors.land } };
    const source = 'source-layer' in layer ? layer['source-layer'] : '';
    const filter = source === 'place' ? showPlaceLabel : source === 'boundary' ? showBoundary : null;
    const filtered = filter ? { ...layer, filter: layer.filter ? ['all', layer.filter, filter] as FilterSpecification : filter } : layer;
    if (filtered.type === 'fill' && ['water', 'landcover', 'landuse', 'park'].includes(source || '')) {
      return { ...filtered, paint: { ...filtered.paint, 'fill-color': source === 'water' ? colors.ocean : source === 'park' ? colors.green : colors.land } };
    }
    if (filtered.type === 'line' && (source === 'boundary' || source === 'waterway')) {
      return { ...filtered, paint: { ...filtered.paint, 'line-color': source === 'boundary' ? colors.boundary : colors.waterway } };
    }
    if (filtered.type === 'symbol' && source === 'place') {
      return { ...filtered, paint: { ...filtered.paint, 'text-color': colors.label, 'text-halo-color': colors.halo, 'text-halo-width': 1.2 } };
    }
    return filtered;
  }),
});
export const INITIAL_BASEMAP_TRANSFORM = atlasBasemap('dark');
export const RENDER_PIXEL_RATIO = Math.min(window.devicePixelRatio || 1, 1.5);

