import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import Map, { useControl, NavigationControl, type MapRef } from 'react-map-gl/maplibre';
import mapLib from './maplibre';
import { MapLibreOverlay, type MapLibreOverlayProps } from '@deck.gl/maplibre';
import { ScatterplotLayer, ColumnLayer } from '@deck.gl/layers';
import 'maplibre-gl/dist/maplibre-gl.css';
import { MINUTE, STEP_MINUTES, observationTime, defaultWindowStart, fileWindow, matchesDataset, matchesTime, nextDetectionMinute, type TimeBasis } from './timeline';
import { API_BASE, FALLBACK_FIRES, getDisplayFRP, type FireFeature } from './fire-data';
import { SiteBrand, SiteNavigation } from './SiteHeader';
import { FireObservations } from './FireObservations';
import { CountrySearch } from './CountrySearch';
import type { Country } from './country-bounds';
import orbitalStars from './assets/orbital-stars.svg';

interface ViewState {
  longitude: number;
  latitude: number;
  zoom: number;
  pitch: number;
  bearing: number;
}

const INITIAL_VIEW_STATE: ViewState = {
  longitude: 8,
  latitude: 18,
  zoom: 1.8,
  pitch: 20,
  bearing: 0
};

function getFRPColor(frp: number): [number, number, number, number] {
  if (frp < 50) return [255, 235, 59, 200];
  if (frp <= 150) return [255, 152, 0, 220];
  return [255, 45, 0, 240];
}

import type { FilterSpecification, TransformStyleFunction, SkySpecification } from 'maplibre-gl';

// Neutral vector styles keep labels crisp. Woodland fill is contextual map
// coverage, not fire data; omit it so its coverage gaps do not resemble anomalies.
const BASEMAP_STYLES = {
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
const ORBITAL_SKY: SkySpecification = {
  'sky-color': 'rgba(0,0,0,0)',
  'horizon-color': 'rgba(0,0,0,0)',
  'fog-color': 'rgba(0,0,0,0)',
  'sky-horizon-blend': 0,
  'horizon-fog-blend': 0,
  'atmosphere-blend': 0.35,
};
const FLAT_SKY: SkySpecification = { ...ORBITAL_SKY, 'atmosphere-blend': 0 };

const atlasBasemap = (theme: 'dark' | 'light'): TransformStyleFunction => (_previous, next) => ({
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
const INITIAL_BASEMAP_TRANSFORM = atlasBasemap('dark');
const RENDER_PIXEL_RATIO = Math.min(window.devicePixelRatio || 1, 1.5);

/**
 * Custom deck.gl Overlay bridge for MapLibre GL
 * Mounts directly into MapLibre's canvas lifecycle ensuring flawless synchronization.
 */
function DeckGLOverlay(props: MapLibreOverlayProps) {
  const overlay = useControl<MapLibreOverlay>(() => new MapLibreOverlay(props));
  useEffect(() => { overlay.setProps(props); }, [overlay, props]);
  return null;
}

export default function App() {
  const mapRef = useRef<MapRef>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const datasetRevision = useRef(0);
  const uploadController = useRef<AbortController | null>(null);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'done' | 'error'>('idle');
  const [uploadMessage, setUploadMessage] = useState('');
  const [allFires, setAllFires] = useState<FireFeature[]>(FALLBACK_FIRES);
  const [dataMeta, setDataMeta] = useState<{ source: string; source_name?: string; observed_from?: string; observed_to?: string; solar_time_basis?: string; local_solar_dates?: string[]; rejected_rows?: number; uploaded?: boolean }>({ source: 'demo' });
  const [reloadData, setReloadData] = useState(0);
  const [mapReady, setMapReady] = useState(false);
  const [timeScope, setTimeScope] = useState<'day' | 'file'>('day');
  const [timeBasis, setTimeBasis] = useState<TimeBasis>('utc');
  const [windowStartOverride, setWindowStartOverride] = useState<number | null>(null);
  const [cursorMinute, setCursorMinute] = useState(1440);
  const [backendStatus, setBackendStatus] = useState<'checking' | 'online' | 'fallback'>('checking');
  const [allHoursMode, setAllHoursMode] = useState<boolean>(true);
  const [selectedSatellite, setSelectedSatellite] = useState<'ALL' | 'MODIS' | 'VIIRS' | 'Harmonized'>('ALL');
  const [vizMode, setVizMode] = useState<'hybrid' | 'columns' | 'scatter'>('scatter');
  const [selectedFire, setSelectedFire] = useState<FireFeature | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [showTimeline, setShowTimeline] = useState(true);
  const [timelineSize, setTimelineSize] = useState('compact');
  const [showTimelineOptions, setShowTimelineOptions] = useState(false);
  const [activeRegion, setActiveRegion] = useState('Global');
  const [mapTheme, setMapTheme] = useState<'dark' | 'light'>('dark');
  const [mapProjection, setMapProjection] = useState<'mercator' | 'globe'>('mercator');
  const projection = useMemo(() => ({ type: mapProjection }), [mapProjection]);
  const appliedMapTheme = useRef<'dark' | 'light'>('dark');
  const flatCamera = useRef<typeof INITIAL_VIEW_STATE | null>(null);

  useEffect(() => {
    if (!mapReady || appliedMapTheme.current === mapTheme) return;
    // react-map-gl forwards transformStyle at construction only. Pass it explicitly
    // on subsequent style changes so both palettes retain the atlas treatment.
    mapRef.current?.getMap().setStyle(BASEMAP_STYLES[mapTheme], { transformStyle: atlasBasemap(mapTheme) });
    appliedMapTheme.current = mapTheme;
  }, [mapReady, mapTheme]);

  const switchProjection = (projection: typeof mapProjection) => {
    if (projection === mapProjection) return;
    const map = mapRef.current;
    if (map) {
      map.stop();
      if (projection === 'globe') {
        const { lng, lat } = map.getCenter();
        flatCamera.current = { longitude: lng, latitude: lat, zoom: map.getZoom(), pitch: map.getPitch(), bearing: map.getBearing() };
        map.getMap().setProjection({ type: projection });
        // Reveal the whole sphere even when switching from a close-up observation.
        const { clientWidth, clientHeight } = map.getContainer();
        const zoom = Math.log2(Math.max(240, Math.min(clientWidth, clientHeight)) / 512) + 1;
        map.jumpTo({ center: [lng, Math.max(-60, Math.min(60, lat))], zoom, pitch: 0, bearing: 0, padding: { top: 0, bottom: 0, left: 0, right: 0 } });
      } else if (flatCamera.current) {
        map.getMap().setProjection({ type: projection });
        const { longitude, latitude, ...camera } = flatCamera.current;
        map.jumpTo({ ...camera, center: [longitude, latitude], padding: { top: 0, bottom: 0, left: 0, right: 0 } });
      }
    }
    setMapProjection(projection);
  };

  // Retry transient API failures instead of leaving a stale demo session indefinitely.
  useEffect(() => {
    const revision = datasetRevision.current;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 12000);
    let active = true;
    const tryFetch = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/v1/fires`, { signal: controller.signal, cache: 'no-store' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (!Array.isArray(data.features) || !data.features.length) throw new Error('No observations returned');
        if (!active || revision !== datasetRevision.current) return;
        setAllFires(data.features);
        setDataMeta(data.metadata || { source: 'demo' });
        setTimeBasis('utc'); setTimeScope('day');
        setWindowStartOverride(null);
        setCursorMinute(1440);
        setSelectedSatellite('ALL');
        setIsPlaying(false);
        setAllHoursMode(true);
        if (data.metadata?.source === 'csv') setVizMode('scatter');
        setBackendStatus('online');
      } catch {
        if (active && revision === datasetRevision.current) setBackendStatus('fallback');
      } finally {
        window.clearTimeout(timeout);
      }
    };
    void tryFetch();
    return () => { active = false; controller.abort(); window.clearTimeout(timeout); };
  }, [reloadData]);

  useEffect(() => {
    if (backendStatus !== 'fallback' || uploadStatus === 'uploading' || dataMeta.uploaded) return;
    const retry = window.setTimeout(() => { setBackendStatus('checking'); setReloadData(value => value + 1); }, 5000);
    return () => window.clearTimeout(retry);
  }, [backendStatus, uploadStatus, dataMeta.uploaded]);

  useEffect(() => () => uploadController.current?.abort(), []);

  const uploadCsv = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.csv')) { setUploadStatus('error'); setUploadMessage('Choose a NASA FIRMS MODIS .csv file.'); return; }
    if (file.size === 0 || file.size > 3 * 1024 * 1024) { setUploadStatus('error'); setUploadMessage(file.size === 0 ? 'This file is empty. Choose a CSV containing observations.' : 'Choose a CSV smaller than 3 MB for this testing tool.'); return; }
    datasetRevision.current += 1;
    uploadController.current?.abort();
    const controller = new AbortController();
    uploadController.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 60000);
    setUploadStatus('uploading'); setUploadMessage(`Reading ${file.name}…`);
    try {
      const response = await fetch(`${API_BASE}/api/v1/fires/upload`, { method: 'POST', headers: { 'Content-Type': 'text/csv; charset=utf-8', 'X-CSV-Filename': encodeURIComponent(file.name) }, body: file, signal: controller.signal });
      const data = await response.json().catch(() => null);
      if (controller.signal.aborted || uploadController.current !== controller) return;
      if (!response.ok) throw new Error(data?.error || `Upload failed (HTTP ${response.status}). Try again.`);
      if (!data?.features?.length || data.metadata?.source !== 'csv') throw new Error('No valid MODIS detections returned. Check the CSV columns.');
      setAllFires(data.features); setDataMeta(data.metadata); setTimeBasis('utc'); setTimeScope('day');
      setWindowStartOverride(null); setCursorMinute(1440); setSelectedSatellite('ALL');
      setIsPlaying(false); setAllHoursMode(true); setVizMode('scatter'); setBackendStatus('online');
      setUploadStatus('done');
      setUploadMessage(`Loaded ${data.features.length.toLocaleString()} detections from ${file.name}.${data.metadata.rejected_rows ? ` ${data.metadata.rejected_rows} invalid rows excluded.` : ''} Showing the file’s latest 24 hours.`);
    } catch (error) {
      if (uploadController.current !== controller) return;
      setUploadStatus('error');
      setUploadMessage(controller.signal.aborted ? 'Upload timed out. Try again with a smaller CSV. Your current map has been kept.' : `${error instanceof Error ? error.message : 'Upload failed. Try again.'} Your current map has been kept.`);
    } finally { window.clearTimeout(timeout); }
  };

  const restoreServerData = () => {
    datasetRevision.current += 1; uploadController.current?.abort(); uploadController.current = null;
    setUploadStatus('idle'); setUploadMessage(''); setBackendStatus('checking'); setReloadData(value => value + 1);
  };

  // Both the map and CSV load asynchronously; frame the loaded data once both are ready.
  useEffect(() => {
    if (!mapReady || !allFires.length) return;
    const coordinates = allFires.map(fire => fire.geometry.coordinates);
    const lngs = coordinates.map(point => point[0]);
    const lats = coordinates.map(point => point[1]);
    mapRef.current?.fitBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]], {
      padding: { top: 140, bottom: Math.min((document.querySelector<HTMLElement>('.timeline-panel')?.offsetHeight ?? 320) + 48, (mapRef.current?.getMap().getContainer().clientHeight ?? 600) * .65), left: 35, right: 55 },
      maxZoom: 7, pitch: 0, duration: 0
    });
  }, [allFires, mapReady]);

  const hasDates = useMemo(() => allFires.some(fire => !!fire.properties.observed_at_utc), [allFires]);
  const defaultStart = useMemo(() => defaultWindowStart(allFires, timeBasis), [allFires, timeBasis]);
  const timestamps = useMemo(() => new globalThis.Map(allFires.map(fire => [fire, observationTime(fire, timeBasis)])), [allFires, timeBasis]);
  const fileBounds = useMemo(() => fileWindow(allFires, timeBasis), [allFires, timeBasis]);
  const durationMinutes = timeScope === 'file' ? fileBounds.durationMinutes : 1440;
  const cursorPosition = Math.min(cursorMinute, durationMinutes);
  const windowStart = timeScope === 'file' ? fileBounds.start : windowStartOverride ?? defaultStart;
  const windowEnd = windowStart + durationMinutes * MINUTE;
  const cursorTime = windowStart + cursorPosition * MINUTE;
  const rangeStart = allHoursMode ? windowStart : Math.max(windowStart, cursorTime - 60 * MINUTE);
  const rangeEnd = allHoursMode ? windowEnd : cursorTime;
  const basisLabel = timeBasis === 'utc' ? 'UTC' : 'Local mean solar time';
  const clockFormat = useMemo(() => new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'UTC' }), []);
  const dateFormat = useMemo(() => new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }), []);
  const formatInstant = (time: number) => `${hasDates ? `${dateFormat.format(time)}, ` : ''}${clockFormat.format(time)}`;
  const datasetFires = useMemo(() => allFires.filter(fire => matchesDataset(fire, selectedSatellite)), [allFires, selectedSatellite]);
  const filteredFires = useMemo(() => datasetFires.filter(fire => matchesTime(timestamps.get(fire) ?? NaN, windowStart, cursorPosition, allHoursMode, durationMinutes)), [datasetFires, timestamps, windowStart, cursorPosition, allHoursMode, durationMinutes]);
  const datasetTimes = useMemo(() => datasetFires.map(fire => timestamps.get(fire) ?? NaN), [datasetFires, timestamps]);
  const nextMinute = useMemo(() => nextDetectionMinute(datasetTimes, windowStart, cursorPosition, durationMinutes), [datasetTimes, windowStart, cursorPosition, durationMinutes]);
  const activeFire = selectedFire && filteredFires.includes(selectedFire) ? selectedFire : null;
  const switchTimeBasis = (basis: TimeBasis) => {
    setTimeBasis(basis); setWindowStartOverride(null); setAllHoursMode(true); setIsPlaying(false); setCursorMinute(timeScope === 'file' ? fileWindow(allFires, basis).durationMinutes : 1440);
  };
  const switchTimeScope = (scope: 'day' | 'file') => {
    setTimeScope(scope); setCursorMinute(scope === 'file' ? fileBounds.durationMinutes : 1440);
    setAllHoursMode(true); setIsPlaying(false);
  };
  useEffect(() => {
    if (!isPlaying) return;
    const timer = window.setInterval(() => setCursorMinute(previous => previous >= durationMinutes ? Math.min(STEP_MINUTES, durationMinutes) : Math.min(previous + STEP_MINUTES, durationMinutes)), 1100);
    return () => window.clearInterval(timer);
  }, [isPlaying, durationMinutes]);

  const showWholeWindow = () => { setSelectedSatellite('ALL'); setAllHoursMode(true); setIsPlaying(false); };

  // Calculated statistics
  const stats = useMemo(() => {
    if (filteredFires.length === 0) {
      return { count: 0, peakFrp: '0.0', avgNormalizedFrp: '0.0' };
    }
    const maxFrp = Math.max(...filteredFires.map((f) => getDisplayFRP(f) || 0));
    const avgFrp =
      filteredFires.reduce((acc, f) => acc + (getDisplayFRP(f) || 0), 0) /
      filteredFires.length;
    return {
      count: filteredFires.length,
      peakFrp: maxFrp.toFixed(1),
      avgNormalizedFrp: avgFrp.toFixed(1)
    };
  }, [filteredFires]);

  // Deck.gl WebGL layers
  const layers = useMemo(() => {
    const activeLayers = [];

    // Screen-sized points show location; color carries FRP, not footprint area.
    if (vizMode === 'scatter' || vizMode === 'hybrid') {
      activeLayers.push(
        new ScatterplotLayer({
          id: 'fire-observations',
          data: filteredFires,
          getPosition: (d: FireFeature) => d.geometry.coordinates,
          radiusUnits: 'pixels',
          getRadius: 4,
          getFillColor: (d: FireFeature) => getFRPColor(getDisplayFRP(d)),
          getLineColor: [23, 47, 64, 220],
          stroked: true,
          lineWidthMinPixels: 1,
          radiusMinPixels: 3,
          radiusMaxPixels: 5,
          pickable: true
        })
      );
    }

    // 3D Extruded Thermal Column Layer
    if (vizMode === 'columns' || vizMode === 'hybrid') {
      activeLayers.push(
        new ColumnLayer({
          id: 'fire-column-elevation',
          data: filteredFires,
          getPosition: (d: FireFeature) => d.geometry.coordinates,
          getElevation: (d: FireFeature) => getDisplayFRP(d) * 500,
          radius: dataMeta.source === 'csv' ? 500 : 10000,
          extruded: true,
          diskResolution: 8,
          material: false,
          getFillColor: (d: FireFeature) => getFRPColor(getDisplayFRP(d)),
          getLineColor: [255, 200, 100, 200],
          pickable: true
        })
      );
    }

    if (activeFire) activeLayers.push(new ScatterplotLayer({
      id: 'selected-observation', data: [activeFire],
      getPosition: (d: FireFeature) => d.geometry.coordinates,
      radiusUnits: 'pixels', getRadius: 10, filled: false, stroked: true,
      getLineColor: mapTheme === 'light' ? [38, 52, 60, 255] : [255, 255, 255, 255],
      lineWidthMinPixels: 2, pickable: false,
    }));
    return activeLayers;
  }, [filteredFires, vizMode, dataMeta.source, mapTheme, activeFire]);

  // Hover Tooltip
  const renderTooltip = useCallback((info: { object?: unknown }) => {
    if (!info.object) return null;
    const feat = info.object as FireFeature;
    const p = feat.properties;
    const coords = feat.geometry.coordinates;

    return {
      html: `
        <div style="font-family: 'DM Sans', sans-serif; padding: 4px; font-size: 12px; line-height: 1.5; min-width: 200px;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; border-bottom: 1px solid rgba(255,255,255,0.15); padding-bottom: 4px;">
            <span style="font-weight: 700; color: #fb923c; font-size: 13px;">${p.satellite}</span>
            <span style="background: rgba(255,255,255,0.1); padding: 1px 6px; border-radius: 4px; font-size: 10px; color: #cbd5e1;">${p.confidence_percent !== undefined ? `${p.confidence_percent}% detection confidence` : p.confidence.toUpperCase()}</span>
          </div>
          <div><b>Normalized FRP:</b> <span style="color: #f87171; font-weight: 600;">${p.normalized_frp === null ? 'Not available' : `${p.normalized_frp.toFixed(1)} MW`}</span></div>
          <div><b>Raw Sensor FRP:</b> <span style="color: #94a3b8;">${p.raw_frp.toFixed(1)} MW</span></div>
          <div style="margin-top: 4px; padding-top: 4px; border-top: 1px dashed rgba(255,255,255,0.1);">
            <div><b>Local Solar Time:</b> ${p.local_solar_time} LST</div>
            <div><b>UTC Overpass:</b> ${p.observed_at_utc || p.acq_time_utc}</div><div><b>Platform:</b> ${p.platform || p.satellite}</div>
            <div style="color: #64748b; font-size: 11px; margin-top: 2px;">Coords: ${Math.abs(coords[1]).toFixed(3)}°${coords[1] >= 0 ? 'N' : 'S'}, ${Math.abs(coords[0]).toFixed(3)}°${coords[0] >= 0 ? 'E' : 'W'}</div>
          </div>
        </div>
      `,
      style: {
        backgroundColor: 'rgba(15, 23, 42, 0.94)',
        color: '#f8fafc',
        borderRadius: '10px',
        border: '1px solid rgba(255, 255, 255, 0.15)',
        boxShadow: '0 12px 30px rgba(0,0,0,0.5)',
        padding: '6px 8px'
      }
    };
  }, []);

  const fitHotspots = () => {
    if (!filteredFires.length) return;
    setActiveRegion('Global');
    const coords = filteredFires.map(f => f.geometry.coordinates);
    const lngs = coords.map(c => c[0]);
    const lats = coords.map(c => c[1]);
    mapRef.current?.fitBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]], {
      padding: { top: 140, bottom: Math.min((document.querySelector<HTMLElement>('.timeline-panel')?.offsetHeight ?? 320) + 48, (mapRef.current?.getMap().getContainer().clientHeight ?? 600) * .65), left: 35, right: 55 }, maxZoom: 7, pitch: 0,
      duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 700
    });
  };

  const locateCountry = ([name, , bounds]: Country) => {
    const map = mapRef.current;
    if (!map) return false;

    const height = map.getMap().getContainer().clientHeight;
    const timelineHeight = document.querySelector<HTMLElement>('.timeline-panel')?.offsetHeight ?? 0;
    map.fitBounds(bounds, {
      padding: { top: Math.min(170, height * .3), bottom: Math.min(timelineHeight + 42, height * .45), left: 28, right: 28 },
      maxZoom: 10,
      pitch: 0,
      bearing: 0,
      duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 700,
    });
    setActiveRegion(name);
    return true;
  };

  const locateFire = (fire: FireFeature) => {
    setSelectedFire(fire);
    setIsPlaying(false);
    if (window.matchMedia('(max-width: 480px)').matches) {
      mapRef.current?.getContainer().closest('.map-stage')?.scrollIntoView({ block: 'start' });
    }
    mapRef.current?.flyTo({ center: fire.geometry.coordinates, zoom: 7, pitch: 30,
      padding: { top: 160, bottom: 200, left: 0, right: Math.min(270, (mapRef.current?.getContainer().clientWidth ?? 600) * .55) },
      duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 700 });
  };

  const exportObservations = () => {
    const blob = new Blob([JSON.stringify({ type: 'FeatureCollection', features: filteredFires }, null, 2)], { type: 'application/geo+json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'prometheus-observations.geojson';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const compactTimeline = timelineSize === 'compact';
  const timelineTime = allHoursMode ? (timeScope === 'file' ? 'Entire file' : 'Selected 24 hours') : clockFormat.format(cursorTime);
  const timelineSources = [{ id: 'ALL', label: 'All' }, { id: 'MODIS', label: 'MODIS' }, { id: 'VIIRS', label: 'VIIRS' }, { id: 'Harmonized', label: 'AI Harmonized' }] as const;

  return (
    <div className="mission-app" data-theme={mapTheme}>
      <header className="mission-header">
        <SiteBrand heading />
        <SiteNavigation current="explorer" />
        <div className="challenge-tag"><span className="tiny-orbit" aria-hidden="true" />NASA Space Apps</div>
        <button className="export-button" aria-label="Export data" title="Export data" onClick={exportObservations}><span aria-hidden="true">↓</span> Export data</button>
        <button className="theme-button" onClick={() => setMapTheme(t => t === 'dark' ? 'light' : 'dark')} aria-label={`Switch to ${mapTheme === 'dark' ? 'light' : 'dark'} theme`}>
          <span aria-hidden="true">{mapTheme === 'dark' ? '☼' : '◐'}</span><span>{mapTheme === 'dark' ? 'Light' : 'Dark'} mode</span>
        </button>
      </header>

      <main className="mission-workspace">
        <aside className="analysis-panel" aria-label="Fire analysis controls">
          <div className="panel-intro">
            <span className="intro-planet" aria-hidden="true" />

            <h2>Every hotspot.<br />A clearer picture.</h2>
            <p>Explore fire activity across the diurnal cycle. Compare satellite observations and harmonized estimates.</p>
            <div className={`data-status ${backendStatus}`} role="status">
              <span className="status-dot" />
              {backendStatus === 'online' ? dataMeta.source === 'csv' ? 'Imported MODIS CSV' : 'Demo API connected' : backendStatus === 'checking' ? 'Connecting to data source' : 'API unavailable · demo data shown'}
              <span className="status-label">{backendStatus === 'online' ? dataMeta.source === 'csv' ? 'CSV' : 'DEMO' : backendStatus === 'checking' ? 'WAIT' : 'SAMPLE'}</span>
            </div>
            {backendStatus === 'fallback' && <button className="retry-data" onClick={() => { setBackendStatus('checking'); setReloadData(value => value + 1); }}>Retry real data</button>}
          </div>

          {import.meta.env.VITE_ENABLE_CSV_UPLOAD !== 'false' && <section className="panel-section csv-upload" aria-labelledby="upload-title" aria-busy={uploadStatus === 'uploading'}>
            <h3 id="upload-title">Test a MODIS CSV</h3>
            <p>Load a file into your current map. Refreshing returns to the server dataset.</p>
            <label htmlFor="modis-csv-file">NASA FIRMS MODIS file (.csv, up to 3 MB)</label>
            <input ref={fileInputRef} id="modis-csv-file" type="file" tabIndex={-1} accept=".csv,text/csv" disabled={uploadStatus === 'uploading'} aria-describedby="upload-feedback" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void uploadCsv(file); }} />
            <button className="upload-csv-button" disabled={uploadStatus === 'uploading'} onClick={() => fileInputRef.current?.click()}>{uploadStatus === 'uploading' ? 'Loading CSV…' : 'Upload CSV'}</button>
            <p id="upload-feedback" className={`upload-feedback ${uploadStatus}`} role={uploadStatus === 'error' ? 'alert' : 'status'}>{uploadMessage || 'Up to 50,000 raw MODIS detections. No predictions are generated.'}</p>
            {dataMeta.uploaded && <button className="retry-data" disabled={uploadStatus === 'uploading'} onClick={restoreServerData}>Restore server dataset</button>}
          </section>}
          {dataMeta.source === 'csv' && <section className="panel-section imported-data" aria-label="Imported observation dataset">
            <h3>{dataMeta.uploaded ? 'Uploaded MODIS snapshot' : 'Imported MODIS snapshot'}</h3>
            <p className="dataset-filename">{dataMeta.source_name}</p>
            <p>{dataMeta.observed_from?.slice(0, 10)} to {dataMeta.observed_to?.slice(0, 10)} (UTC)</p>
            <p>{allFires.length.toLocaleString()} detections · Measured FRP only</p>
            <p>{timeBasis === 'utc' ? 'UTC uses original acquisition timestamps to show simultaneous observations worldwide.' : 'Solar clocks align local times across locations, not simultaneous observations (UTC + longitude ÷ 15).' } This is an imported snapshot, not a live feed.</p>
            {timeScope === 'day' && <><label htmlFor="window-start">24-hour window starts ({timeBasis === 'utc' ? 'UTC' : 'local solar clock'})</label>
            <input id="window-start" type="datetime-local" step="60" required value={new Date(windowStart).toISOString().slice(0, 16)} onChange={e => {
              const start = Date.parse(`${e.target.value}:00Z`);
              if (Number.isFinite(start)) { setWindowStartOverride(start); setIsPlaying(false); }
            }} />
            <p>Ends {formatInstant(windowEnd)} {basisLabel}. Windows include their start and exclude their end.</p>
            <button className="retry-data" onClick={() => { setWindowStartOverride(null); setCursorMinute(1440); setAllHoursMode(true); setIsPlaying(false); }}>Reset to latest 24 hours</button></>}
            {timeScope === 'file' && <p>Entire file: {formatInstant(fileBounds.start)} – {formatInstant(fileBounds.start + (fileBounds.durationMinutes - 1) * MINUTE)} {basisLabel}. No date range is excluded.</p>}
            {!!dataMeta.rejected_rows && <p>{dataMeta.rejected_rows} invalid rows excluded.</p>}
          </section>}
          <section className="panel-section" aria-labelledby="summary-title">
            <div className="section-heading"><h3 id="summary-title">Observation summary</h3><span>Current selection</span></div>
            <div className="primary-stat"><strong>{stats.count.toLocaleString()}</strong><span>visible hotspots</span></div>
            <div className="stat-grid">
              <div><span>Peak FRP</span><strong>{stats.peakFrp}<small> MW</small></strong></div>
              <div><span>Mean FRP</span><strong>{stats.avgNormalizedFrp}<small> MW</small></strong></div>
            </div>
            <p className="micro-copy">FRP · Raw sensors / normalized predictions</p>
          </section>

          <section className="panel-section" aria-labelledby="sources-title">
            <div className="section-heading"><h3 id="sources-title">Observation source</h3></div>
            <div className="source-options" role="group" aria-labelledby="sources-title">
              {([
                { id: 'ALL', label: 'All view', detail: 'Combined dataset', badge: 'ALL' },
                { id: 'MODIS', label: 'Raw MODIS (1 km)', detail: 'Terra & Aqua · 1 km', badge: 'M' },
                { id: 'VIIRS', label: 'Raw VIIRS (375 m)', detail: 'High resolution · 375 m', badge: 'V' },
                { id: 'Harmonized', label: 'AI harmonized', detail: 'Normalized estimates', badge: 'AI' }
              ] as const).map(source => (
                <button key={source.id} className={`source-option ${selectedSatellite === source.id ? 'selected' : ''}`} aria-pressed={selectedSatellite === source.id} onClick={() => setSelectedSatellite(source.id)}>
                  <span className="source-badge">{source.badge}</span><span className="source-text"><strong>{source.label}</strong><small>{source.detail}</small></span><span className="selection-dot" />
                </button>
              ))}
            </div>
          </section>

          <section className="panel-section" aria-labelledby="render-title">
            <div className="section-heading"><h3 id="render-title">Visualization</h3></div>
            <div className="segmented-control" role="group" aria-labelledby="render-title">
              {([{ id: 'scatter', label: 'Points' }, { id: 'columns', label: 'Columns' }, { id: 'hybrid', label: 'Hybrid 3D' }] as const).map(mode => (
                <button key={mode.id} className={vizMode === mode.id ? 'selected' : ''} aria-pressed={vizMode === mode.id} onClick={() => setVizMode(mode.id)}>{mode.label}</button>
              ))}
            </div>
          </section>
          <FireObservations fires={filteredFires} timeBasis={timeBasis} selected={activeFire} onSelect={locateFire} onFit={fitHotspots} />
          <div className="panel-footer"><p>One planet. Multiple perspectives.<br /><span>MODIS + VIIRS / Diurnal harmonization</span></p></div>
        </aside>

        <section className="map-stage" data-projection={mapProjection} aria-label="Interactive fire observation map">
          {mapProjection === 'globe' && <img className="orbital-stars" src={orbitalStars} alt="" aria-hidden="true" draggable={false} />}
          {filteredFires.length === 0 && <div className="map-empty" role="status"><strong>{dataMeta.source === 'csv' && selectedSatellite !== 'ALL' && selectedSatellite !== 'MODIS' ? 'This file contains MODIS only' : 'No matching detections in this dataset'}</strong><span>This does not mean there were no fires. Try another dataset, time window, or Next detection.</span><button onClick={() => { showWholeWindow(); }}>{timeScope === 'file' ? 'View entire file' : 'View all selected 24 hours'}</button></div>}
          <Map mapLib={mapLib} ref={mapRef} initialViewState={INITIAL_VIEW_STATE} onLoad={() => setMapReady(true)}
            mapStyle={BASEMAP_STYLES.dark} projection={projection} transformStyle={INITIAL_BASEMAP_TRANSFORM} pixelRatio={RENDER_PIXEL_RATIO}
            sky={mapProjection === 'globe' ? ORBITAL_SKY : FLAT_SKY}
            minZoom={-2} renderWorldCopies={false} dragRotate={true} touchPitch={true} touchZoomRotate={true} keyboard={true} pitchWithRotate={true} maxPitch={85}>
            <DeckGLOverlay useDevicePixels={RENDER_PIXEL_RATIO} interleaved={false} layers={layers} getTooltip={renderTooltip} onClick={info => { setSelectedFire((info.object as FireFeature | undefined) ?? null); setIsPlaying(false); }} />
            <NavigationControl position="top-right" visualizePitch={true} />
          </Map>
          <div className="map-top-controls">
            <div className="map-heading"><h2>{activeRegion === 'Global' ? 'Global fire activity' : activeRegion} <span>/ {mapProjection === 'globe' ? 'Globe' : 'Flat map'}</span></h2><span className="mobile-data-status">{backendStatus === 'online' ? 'BACKEND CONNECTED' : backendStatus === 'checking' ? 'CONNECTING' : 'DEMO DATASET'}</span></div>
            <CountrySearch onSelect={locateCountry} />
            <div className="projection-switch" role="group" aria-label="Map view">
              <button type="button" aria-pressed={mapProjection === 'mercator'} onClick={() => switchProjection('mercator')}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden="true"><path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2zM9 3v16M15 5v16" /></svg>
                Flat map
              </button>
              <button type="button" aria-pressed={mapProjection === 'globe'} onClick={() => switchProjection('globe')}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="12" cy="12" r="9" /><ellipse cx="12" cy="12" rx="4" ry="9" /><path d="M3 12h18" /></svg>
                3D globe
              </button>
            </div>
          </div>
          <div className="map-help">DRAG TO PAN<span>·</span>RIGHT-DRAG TO ROTATE<span>·</span>SCROLL TO ZOOM</div>
          {activeFire && <section className="observation-detail" aria-label="Selected observation">
            <div className="observation-detail-heading"><strong>{activeFire.properties.platform || activeFire.properties.satellite}</strong><button type="button" aria-label="Close observation details" onClick={() => setSelectedFire(null)}>Close</button></div>
            <p>{activeFire.geometry.coordinates[1].toFixed(3)}°, {activeFire.geometry.coordinates[0].toFixed(3)}°</p>
            <dl><div><dt>{activeFire.properties.satellite.toLowerCase().includes('harmonized') ? 'Estimated FRP' : 'Measured FRP'}</dt><dd>{getDisplayFRP(activeFire).toFixed(1)} MW</dd></div>
            <div><dt>Acquired UTC</dt><dd>{activeFire.properties.observed_at_utc ? activeFire.properties.observed_at_utc.replace('T', ' ').slice(0, 16) : `${activeFire.properties.acq_time_utc} · Undated demo`}</dd></div></dl>
            <p>Observation point, not a fire perimeter.</p>
          </section>}
          <div className="thermal-legend" hidden={!!activeFire} aria-label="Fire radiative power color scale">
            <p className="marker-key"><span className="fire-dot" aria-hidden="true" /> {dataMeta.source === 'csv' ? 'MODIS detection' : 'Sample fire observation'}</p><div><span>Fire radiative power</span><span>MW</span></div><div className="thermal-ramp" /><div className="legend-values"><span>&lt;50</span><span>50–150</span><span>&gt;150 MW</span></div><p className="marker-note">Color shows FRP. Points are not fire size.</p>
          </div>

          <div className="map-bottom-controls">
            <section className={`timeline-panel${showTimeline ? '' : ' collapsed'}`} data-size={timelineSize} aria-label="Observation timeline controls">
              <button type="button" className="timeline-toggle" aria-expanded={showTimeline} aria-controls="timeline-controls" aria-label={showTimeline ? 'Hide timeline' : `Show timeline, ${timelineTime}${allHoursMode ? '' : ` ${basisLabel}`}`} title={showTimeline ? 'Hide timeline' : 'Show timeline'} onClick={() => setShowTimeline(visible => !visible)}>
                {!showTimeline && <span className="timeline-mini-time">{timelineTime}{!allHoursMode && <small>{timeBasis === 'utc' ? 'UTC' : 'LST'}</small>}</span>}
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d={showTimeline ? 'm4 6 4 4 4-4' : 'm4 10 4-4 4 4'} />
                </svg>
              </button>
              <div id="timeline-controls" hidden={!showTimeline}>
                <div className="timeline-toolbar">
                  <button className="play-button" aria-label={isPlaying ? 'Pause timeline playback' : 'Play timeline'} aria-pressed={isPlaying} onClick={() => { setAllHoursMode(false); setIsPlaying(playing => !playing); }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">{isPlaying ? <path d="M6 4h4v16H6zm8 0h4v16h-4z" /> : <path d="m7 3 15 9-15 9z" />}</svg>
                  </button>
                  <div className="timeline-title"><strong>{timelineTime}<small>{basisLabel}{!hasDates ? ' · Undated demo' : ''}</small></strong></div>
                  {compactTimeline && <button type="button" className="overview-button timeline-options-toggle" aria-label="Timeline options" aria-expanded={showTimelineOptions} aria-controls="timeline-options" title="Timeline options" onClick={() => setShowTimelineOptions(open => !open)}>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                      <circle cx="3" cy="8" r="1.3" /><circle cx="8" cy="8" r="1.3" /><circle cx="13" cy="8" r="1.3" />
                    </svg>
                  </button>}
                </div>
                <div className="timeline-track">
                  <input className="diurnal-slider" type="range" min="0" max={Math.ceil(durationMinutes / STEP_MINUTES)} step="1" value={Math.ceil(cursorPosition / STEP_MINUTES)} aria-label="Timeline position" aria-valuetext={`${formatInstant(cursorTime)} ${basisLabel}; ${allHoursMode ? 'showing full range' : 'showing previous 60 minutes'}`} onChange={e => { setCursorMinute(Math.min(Number(e.target.value) * STEP_MINUTES, durationMinutes)); setAllHoursMode(false); setIsPlaying(false); }} />
                  {!compactTimeline && <div className="utc-ticks">{[0, .25, .5, .75, 1].map(fraction => <span key={fraction}>{durationMinutes > 1440 && hasDates && <small>{dateFormat.format(windowStart + fraction * durationMinutes * MINUTE)}</small>}{clockFormat.format(windowStart + fraction * durationMinutes * MINUTE)}</span>)}</div>}
                </div>
                <div id="timeline-options" hidden={compactTimeline && !showTimelineOptions}>
                  <div className="timeline-settings">
                    <select aria-label="Timeline time system" value={timeBasis} onChange={e => switchTimeBasis(e.target.value === 'utc' ? 'utc' : 'solar')}>
                      <option value="utc">UTC</option>
                      <option value="solar">Solar</option>
                    </select>
                    <select aria-label="Observation date range" value={timeScope} onChange={e => switchTimeScope(e.target.value === 'day' ? 'day' : 'file')}>
                      <option value="day">24 hours</option>
                      <option value="file">Full file</option>
                    </select>
                    <select aria-label="Timeline size" title="Timeline size" value={timelineSize} onChange={e => setTimelineSize(e.target.value)}>
                      <option value="compact">Compact</option>
                      <option value="medium">Medium</option>
                      <option value="large">Large</option>
                    </select>
                  </div>
                  <div className="timeline-tools">
                    <button className={`overview-button ${allHoursMode ? 'selected' : ''}`} aria-pressed={allHoursMode} onClick={() => { setAllHoursMode(mode => !mode); setIsPlaying(false); }}>{allHoursMode ? 'Previous 60 min' : 'Show full range'}</button>
                    <button className="overview-button" disabled={nextMinute === null} onClick={() => { if (nextMinute !== null) { setCursorMinute(nextMinute); setAllHoursMode(false); setIsPlaying(false); } }}>Next detection</button>
                  </div>
                  <div className="timeline-readout">
                    <p className="window-readout">{formatInstant(rangeStart)} – {formatInstant(rangeEnd)} {timeBasis === 'utc' ? 'UTC' : '(local solar clock)'}</p>
                    <span className="hotspot-count" role="status" aria-live={isPlaying ? 'off' : 'polite'}>Matching detections: <strong>{stats.count.toLocaleString()}</strong></span>
                    {compactTimeline && <select aria-label="Satellite dataset layers" value={selectedSatellite} onChange={e => {
                        const source = timelineSources.find(source => source.id === e.target.value);
                        if (source) setSelectedSatellite(source.id);
                      }}>
                        {timelineSources.map(source => <option key={source.id} value={source.id}>{source.id === 'ALL' ? 'All layers' : source.label}</option>)}
                      </select>}
                  </div>
                  {!compactTimeline && <div className="dataset-pills" role="group" aria-label="Satellite dataset layers">
                    {timelineSources.map(source => <button key={source.id} aria-pressed={selectedSatellite === source.id} onClick={() => setSelectedSatellite(source.id)}>{source.label}</button>)}
                  </div>}
                </div>
              </div>
            </section>
          </div>
        </section>
      </main>
    </div>
  );
}
