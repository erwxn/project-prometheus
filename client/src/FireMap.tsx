import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import Map, { NavigationControl, useControl, type MapRef } from 'react-map-gl/maplibre';
import { MapLibreOverlay, type MapLibreOverlayProps } from '@deck.gl/maplibre';
import { GeoJsonLayer, IconLayer, ScatterplotLayer } from '@deck.gl/layers';
import type { Layer, PickingInfo } from '@deck.gl/core';
import { TerraDraw, TerraDrawPolygonMode, TerraDrawRectangleMode, TerraDrawSelectMode, type GeoJSONStoreFeatures } from 'terra-draw';
import { TerraDrawMapLibreGLAdapter } from 'terra-draw-maplibre-gl-adapter';
import mapLib from './maplibre';
import { basemapRequest } from './basemap-boundaries';
import { BASEMAP_STYLES, INITIAL_BASEMAP_TRANSFORM, INITIAL_VIEW_STATE, RENDER_PIXEL_RATIO, ORBITAL_SKY, FLAT_SKY, atlasBasemap, getFRPColor } from './map-style';
import { observationFrp, type AreaFeature, type DrawMode } from './analytics-model';
import { validateArea, validateDrawingArea } from './area-selection';
import { useDashboard } from './dashboard-context';
import type { FireFeature } from './fire-data';
import { satelliteIconAtlas, satelliteIconMapping, satelliteMarker, satelliteName } from './satellite-markers';
import { predictionBands, probabilityLabel, type ForecastCells } from './morocco-predictions';

function DeckGLOverlay(props: MapLibreOverlayProps) {
  const overlay = useControl<MapLibreOverlay>(() => new MapLibreOverlay(props));
  useEffect(() => { overlay.setProps(props); }, [overlay, props]);
  return null;
}

interface FireMapProps {
  trackArchive?: boolean;
  simulated?: boolean;
  mapRef: RefObject<MapRef | null>;
  features: FireFeature[];
  theme: 'light' | 'dark';
  projection: 'mercator' | 'globe';
  selectedFeature?: FireFeature | null;
  forecast?: ForecastCells;
  onSelectForecast?(probability: number): void;
  onSelectFeature?(feature: FireFeature | null): void;
  mode: DrawMode;
  onModeChange(mode: DrawMode): void;
  onDrawingError(message: string): void;
  onLoad?(): void;
}

export function FireMap({ trackArchive = true, simulated = false, mapRef, features, theme, projection, selectedFeature, onSelectFeature, forecast, onSelectForecast, mode, onModeChange, onDrawingError, onLoad }: FireMapProps) {
  const { state, dispatch, archive, camera, saveCamera } = useDashboard();
  const [ready, setReady] = useState(false);
  const area = state.filters.area;
  const {active:archiveActive,updateViewport}=archive;
  useEffect(()=>{if(!ready || !archiveActive || !trackArchive)return;const map=mapRef.current!.getMap();const update=()=>{const b=map.getBounds();if(b && b.getWest()>=-180 && b.getEast()<=180 && b.getWest()<b.getEast())updateViewport([b.getWest(),Math.max(-90,b.getSouth()),b.getEast(),Math.min(90,b.getNorth())]);};map.on('moveend',update);update();return()=>{map.off('moveend',update);};},[ready,archiveActive,updateViewport,mapRef,trackArchive]);


  const [styleRevision, setStyleRevision] = useState(0);
  const appliedTheme = useRef<'dark' | 'light'>('dark');
  const appliedProjection = useRef<'mercator' | 'globe'>('mercator');
  const flatCamera = useRef<{ center: [number, number]; zoom: number; pitch: number; bearing: number } | null>(null);
  const drawing = useRef<TerraDraw | null>(null);
  const stylePending = useRef(false);
  const callbacks = useRef({ dispatch, onModeChange, onDrawingError });
  useEffect(() => { callbacks.current = { dispatch, onModeChange, onDrawingError }; }, [dispatch, onModeChange, onDrawingError]);
  const stopDrawing = useCallback(() => { const instance = drawing.current; drawing.current = null; instance?.stop(); }, []);

  useEffect(() => {
    if (!ready) return;
    const map = mapRef.current!.getMap();
    const styleLoaded = () => { stylePending.current = false; setStyleRevision(value => value + 1); };
    map.on('style.load', styleLoaded);
    return () => { map.off('style.load', styleLoaded); };
  }, [ready, mapRef]);

  useEffect(() => {
    if (!ready || appliedTheme.current === theme) return;
    stopDrawing();
    stylePending.current = true;
    mapRef.current!.getMap().setStyle(BASEMAP_STYLES[theme], { transformStyle: atlasBasemap(theme) });
    appliedTheme.current = theme;
  }, [theme, ready, mapRef, stopDrawing]);

  useEffect(() => {
    if (!ready || appliedProjection.current === projection) return;
    const map = mapRef.current!;
    map.stop();
    if (projection === 'globe') {
      const { lng, lat } = map.getCenter();
      flatCamera.current = { center: [lng, lat], zoom: map.getZoom(), pitch: map.getPitch(), bearing: map.getBearing() };
      const { clientWidth, clientHeight } = map.getContainer();
      const zoom = Math.log2(Math.max(240, Math.min(clientWidth, clientHeight)) / 512) + 1;
      map.jumpTo({ center: [lng, Math.max(-60, Math.min(60, lat))], zoom, pitch: 0, bearing: 0, padding: { top: 0, bottom: 0, left: 0, right: 0 } });
    } else if (flatCamera.current) map.jumpTo({ ...flatCamera.current, padding: { top: 0, bottom: 0, left: 0, right: 0 } });
    appliedProjection.current = projection;
  }, [projection, ready, mapRef]);

  useEffect(() => {
    if (!ready) return;
    const map = mapRef.current!.getMap();
    // isStyleLoaded() also becomes false while camera movement fetches tiles;
    // drawing sources can be restored as soon as the style itself is present.
    if (stylePending.current || !map.getStyle()) return;
    const validate = (feature: GeoJSONStoreFeatures, context: { updateType: string }) => {
      if (context.updateType === 'provisional') return { valid: true };
      const error = validateArea(feature);
      if (error) callbacks.current.onDrawingError(error);
      return { valid: !error };
    };
    const validateSketch = (feature: GeoJSONStoreFeatures, context: { updateType: string }) => {
      const result = validateDrawingArea(feature, context);
      if (result.reason) callbacks.current.onDrawingError(result.reason);
      return result;
    };
    const draw = new TerraDraw({
      adapter: new TerraDrawMapLibreGLAdapter({ map, coordinatePrecision: 7 }),
      modes: [
        new TerraDrawPolygonMode({ validation: validateSketch, styles: { fillColor: '#72c4dd', fillOpacity: .16, outlineColor: theme === 'light' ? '#285e79' : '#73d4ed', outlineWidth: 2 } }),
        new TerraDrawRectangleMode({ validation: validateSketch, styles: { fillColor: '#72c4dd', fillOpacity: .16, outlineColor: theme === 'light' ? '#285e79' : '#73d4ed', outlineWidth: 2 } }),
        new TerraDrawSelectMode({ keyEvents: null, flags: {
          polygon: { feature: { draggable: true, validation: validate, selfIntersectable: false, coordinates: { draggable: true, midpoints: true, deletable: true } } },
          rectangle: { feature: { draggable: true, validation: validate, coordinates: { resizable: 'opposite' } } },
        } }),
      ],
    });
    drawing.current = draw;
    draw.start();
    const adding = mode === 'polygon' || mode === 'rectangle';
    if (area && !adding) {
      const id = typeof area.id === 'string' ? area.id : crypto.randomUUID();
      const geometry = { ...area.geometry, coordinates: area.geometry.coordinates.map(ring => ring.map(point => point.map(value => Number(value.toFixed(7))))) };
      const results = draw.addFeatures([{ ...area, id, geometry, properties: { ...area.properties, mode: area.properties.kind === 'rectangle' ? 'rectangle' : 'polygon' } }]);
      if (results.some(result => !result.valid)) {
        callbacks.current.onDrawingError('Could not restore the selection boundary. Clear the area and select it again.');
        return () => { if (drawing.current === draw) stopDrawing(); };
      }
      draw.setMode(mode);
      if (mode === 'select') draw.selectFeature(id);
    } else draw.setMode(mode);
    draw.on('finish', (id) => {
      const feature = draw.getSnapshotFeature(id);
      if (feature?.geometry.type !== 'Polygon') return;
      const selected: AreaFeature = { type: 'Feature', id, geometry: feature.geometry, properties: { kind: feature.properties.mode === 'rectangle' ? 'rectangle' : 'polygon' } };
      const error = validateArea(selected);
      if (error) { callbacks.current.onDrawingError(error); return; }
      callbacks.current.onDrawingError('');
      callbacks.current.dispatch({ type: 'filters', patch: { area: selected } });
      callbacks.current.onModeChange('select');
    });
    // Terra Draw listens on the MapLibre canvas. Keep the separate deck canvas
    // from swallowing pointer input while drawing or moving a vertex.
    const overlays = [...map.getContainer().querySelectorAll('canvas')].filter(canvas => canvas !== map.getCanvas());
    for (const canvas of overlays) canvas.style.pointerEvents = mode === 'static' ? '' : 'none';
    return () => { if (drawing.current === draw) stopDrawing(); for (const canvas of overlays) canvas.style.pointerEvents = ''; };
  }, [ready, mapRef, area, mode, styleRevision, stopDrawing, theme]);

  const layers = useMemo(() => {
    const layers: Layer[] = [];
    if (forecast) layers.push(new GeoJsonLayer<{ probability: number }>({
      id: 'morocco-prediction-cells', data: forecast, filled: true, stroked: true,
      getFillColor: feature => [...(predictionBands.find(band => feature.properties.probability < band.limit) ?? predictionBands[3]).color],
      getLineColor: theme === 'light' ? [33, 41, 73, 155] : [222, 232, 248, 135],
      lineWidthMinPixels: 0.35, pickable: mode === 'static',
    }));
    const symbols = {
      data: features, iconAtlas: satelliteIconAtlas, iconMapping: satelliteIconMapping,
      getPosition: (feature: FireFeature) => feature.geometry.coordinates,
      getIcon: (feature: FireFeature) => satelliteMarker(feature.properties),
    };
    layers.push(new IconLayer<FireFeature>({
      ...symbols, id: 'fire-observation-outlines', getSize: simulated ? 9 : 14, opacity: simulated ? .5 : 1, getColor: [16, 34, 45, 255],
    }), new IconLayer<FireFeature>({
      ...symbols, id: 'fire-observations', getSize: simulated ? 7 : 11, opacity: simulated ? .72 : 1,
      getColor: feature => getFRPColor(observationFrp(feature)), pickable: mode === 'static',
    }));
    if (selectedFeature) layers.push(new ScatterplotLayer<FireFeature>({
      id: 'selected-observation', data: [selectedFeature], getPosition: d => d.geometry.coordinates,
      radiusUnits: 'pixels', getRadius: 10, filled: false, stroked: true,
      getLineColor: theme === 'light' ? [38, 52, 60, 255] : [255, 255, 255, 255], lineWidthMinPixels: 2, pickable: false,
    }));
    return layers;
  }, [features, selectedFeature, theme, mode, simulated, forecast]);

  const tooltip = useCallback((info: PickingInfo) => {
    if (!info.object) return null;
    if (info.layer?.id === 'morocco-prediction-cells') return { text: `Predicted share of Moroccan detections: ${probabilityLabel(info.object.properties.probability)}` };
    const feature = info.object as FireFeature, p = feature.properties;
    const power = (value: number | null) => value === null || !Number.isFinite(value) ? 'Not available' : `${value.toFixed(1)} MW`;
    return { text: `Satellite: ${satelliteName(p)}\nSource: ${p.satellite}${p.source_sensor ? ` (${p.source_sensor})` : ''}${p.record_unit === 'predicted_cell' ? ' · Predicted 500 m cell' : p.record_unit === 'fire_group' ? ' · Fire group' : ''}${p.p_viirs !== undefined ? `\nVIIRS detection probability: ${(p.p_viirs * 100).toFixed(1)}%` : ''}${simulated ? ' · SIMULATED' : ''}\nRaw FRP: ${power(p.raw_frp)}\nNormalized FRP: ${power(p.normalized_frp)}\nAcquired (UTC): ${p.observed_at_utc || `${p.acq_time_utc} · undated`}\nLocal mean solar time: ${p.local_solar_time || 'Unavailable'}\nConfidence: ${p.confidence || 'Unavailable'}\nLatitude, longitude: ${feature.geometry.coordinates[1].toFixed(4)}, ${feature.geometry.coordinates[0].toFixed(4)}`, style: { backgroundColor: '#172f40', color: '#f4f7fa', font: '12px/1.6 "DM Sans", sans-serif', borderRadius: '4px', maxWidth: '300px' } };
  }, [simulated]);

  return <Map mapLib={mapLib} ref={mapRef} initialViewState={camera.current ?? INITIAL_VIEW_STATE} onMoveEnd={event => { const v = event.viewState; saveCamera({ longitude: v.longitude, latitude: v.latitude, zoom: v.zoom, pitch: v.pitch, bearing: v.bearing }); }} onLoad={() => { setReady(true); onLoad?.(); }}
    mapStyle={BASEMAP_STYLES.dark} projection={{ type: projection }} transformStyle={INITIAL_BASEMAP_TRANSFORM} transformRequest={basemapRequest} pixelRatio={RENDER_PIXEL_RATIO}
    sky={projection === 'globe' ? ORBITAL_SKY : FLAT_SKY} minZoom={-2} renderWorldCopies={false} dragRotate touchPitch touchZoomRotate keyboard pitchWithRotate maxPitch={85}>
    <DeckGLOverlay useDevicePixels={RENDER_PIXEL_RATIO} interleaved={false} layers={layers} getTooltip={tooltip} onClick={info => {
      if (mode !== 'static') return;
      if (info.layer?.id === 'morocco-prediction-cells' && info.object) onSelectForecast?.(info.object.properties.probability);
      else onSelectFeature?.((info.object as FireFeature | undefined) ?? null);
    }} />
    <NavigationControl position="top-right" visualizePitch />
  </Map>;
}
