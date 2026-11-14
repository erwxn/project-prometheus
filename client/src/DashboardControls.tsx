import { useId, useMemo, useRef, useState, type RefObject } from 'react';
import type { MapRef } from 'react-map-gl/maplibre';
import { useDashboard } from './dashboard-context';
import { dateRangeError } from './analytics-engine';
import { SENSOR_IDS, availableSensors, metricLabel, type ActivityMetric, type DrawMode, type SensorFilter } from './analytics-model';
import { areaBounds, radiusArea } from './area-selection';
import { TemporaryDataPicker } from './TemporaryDataPicker';

export function DatasetControls() {
  const { state, retry, uploadCsv, showSimulatedHistory, returnToLoaded } = useDashboard();
  const input = useRef<HTMLInputElement>(null);
  const id = useId();
  const simulated = state.collection.metadata.source === 'simulated';
  return <div className="dataset-controls">
    <TemporaryDataPicker />
    <div className={`dataset-notice${simulated ? ' simulated' : ''}`} role="status">
      <strong>{state.status === 'loading' ? 'Loading observations…' : simulated ? 'SIMULATED HISTORY · 2021–2025' : state.collection.metadata.source === 'csv' ? state.collection.metadata.source_name || 'Imported MODIS snapshot' : state.collection.metadata.source === 'demo' ? 'Illustrative demo · no acquisition dates' : 'Loaded observation snapshot'}</strong>
      <span>{simulated ? 'Synthetic examples for exploring the tools. These are not NASA satellite observations.' : state.collection.metadata.source === 'csv' ? 'Recorded detections only. This file does not establish complete satellite coverage.' : state.collection.metadata.source === 'demo' ? 'The current dataset has no dated history. Select simulated history to try the calendar and comparisons.' : 'Source provenance and complete satellite coverage are not established by this API response.'}</span>
    </div>
    {state.error && <p role="alert" className="dashboard-error">{state.error} Current examples/data remain visible. <button onClick={() => void retry()}>Retry server</button></p>}
    <div className="control-actions">
      {simulated ? <button onClick={() => state.loadedCollection ? returnToLoaded() : void retry()}>{state.loadedCollection ? 'Return to loaded dataset' : 'Load server dataset'}</button> : <button onClick={() => void showSimulatedHistory()}>Use simulated history</button>}
      {import.meta.env.VITE_ENABLE_CSV_UPLOAD !== 'false' && <>
        <input ref={input} id={id} className="visually-hidden" type="file" accept=".csv,text/csv" tabIndex={-1} aria-label="NASA FIRMS MODIS CSV, up to 3 MB" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void uploadCsv(file); }} />
        <button disabled={state.uploadStatus === 'uploading'} onClick={() => input.current?.click()}>{state.uploadStatus === 'uploading' ? 'Loading CSV…' : 'Upload MODIS CSV'}</button>
      </>}
      {state.collection.metadata.uploaded && <button onClick={() => void retry()}>Restore server dataset</button>}
    </div>
    {state.uploadMessage && <p className={`upload-feedback ${state.uploadStatus}`} role={state.uploadStatus === 'error' ? 'alert' : 'status'}>{state.uploadMessage}</p>}
    <small>Temporary CSVs: up to 3 MB / 50,000 detections. Navigation keeps your upload; refreshing restores server data.</small>
  </div>;
}

export function GlobalFilters({ compact = false }: { compact?: boolean }) {
  const { state, dispatch } = useDashboard();
  const filters = state.filters;
  const id = useId();
  const [error, setError] = useState('');
  const rangeKey = `${filters.startDate}:${filters.endDate}`;
  const [previousRange, setPreviousRange] = useState(rangeKey);
  if (previousRange !== rangeKey) { setPreviousRange(rangeKey); setError(''); }
  const available = useMemo(() => availableSensors(state.collection), [state.collection]);
  return <div className={`global-filters${compact ? ' compact' : ''}`} aria-label="Shared dashboard filters">
    <form className="date-filter" onSubmit={event => { event.preventDefault(); const data = new FormData(event.currentTarget); const start = String(data.get('startDate') || ''), end = String(data.get('endDate') || ''); const error = dateRangeError(start, end); setError(error || ''); if (!error) dispatch({ type: 'filters', patch: { startDate: start, endDate: end } }); }}>
      <label htmlFor={`${id}-start`}>Start date (UTC)<input key={`${rangeKey}-start`} id={`${id}-start`} name="startDate" type="date" defaultValue={filters.startDate} disabled={!filters.startDate} required /></label>
      <label htmlFor={`${id}-end`}>End date (UTC)<input key={`${rangeKey}-end`} id={`${id}-end`} name="endDate" type="date" defaultValue={filters.endDate} disabled={!filters.endDate} required /></label>
      <button disabled={!filters.startDate}>Apply dates</button>
    </form>
    <label htmlFor={`${id}-sensor`}>Sensor<select id={`${id}-sensor`} value={filters.sensor} onChange={event => dispatch({ type: 'filters', patch: { sensor: event.target.value as SensorFilter } })}>
      <option value="ALL">All sources · overview</option>{SENSOR_IDS.map(sensor => <option key={sensor} value={sensor}>{sensor}{available.includes(sensor) ? '' : ' · no loaded data'}</option>)}
    </select></label>
    <label htmlFor={`${id}-metric`}>Activity metric<select id={`${id}-metric`} value={filters.metric} onChange={event => dispatch({ type: 'filters', patch: { metric: event.target.value as ActivityMetric } })}>{(['detections', 'mean-frp'] as const).map(metric => <option key={metric} value={metric}>{metricLabel(metric)}</option>)}</select></label>
    {filters.selectedDay && <button className="day-filter" onClick={() => dispatch({ type: 'filters', patch: { selectedDay: null } })}>Clear selected day · {filters.selectedDay} ×</button>}
    {!filters.startDate && <p className="filter-help">Date filters require dated observations. The current illustrative data is undated.</p>}
    {filters.sensor === 'ALL' && <p className="filter-help">Mixed sensor counts describe records, not equivalent fire activity. Select one sensor for historical comparisons.</p>}
    {error && <p role="alert" className="dashboard-error">{error}</p>}
  </div>;
}

interface AreaControlsProps {
  mapRef: RefObject<MapRef | null>;
  mode: DrawMode;
  onModeChange(mode: DrawMode): void;
  error: string;
  onError(message: string): void;
}
export function AreaControls({ mapRef, mode, onModeChange, error, onError }: AreaControlsProps) {
  const { state, dispatch } = useDashboard();
  const area = state.filters.area;
  const id = useId();
  const center = area?.properties.kind === 'radius' ? area.properties.center : undefined;
  const radius = area?.properties.kind === 'radius' ? area.properties.radiusKm : 25;
  const coordinateKey = `${center?.join(',') ?? 'default'}:${radius}`;
  const zoom = () => { if (area) mapRef.current?.fitBounds(areaBounds(area), { padding: 70, maxZoom: 12, pitch: 0, duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 600 }); };
  return <div className="area-controls">
    <h3>Select an area</h3>
    <p>Draw a region or select a location and radius. Country search moves the camera.</p>
    <div className="area-tools" role="group" aria-label="Area drawing tools">
      <button aria-pressed={mode === 'rectangle'} onClick={() => { onError(''); onModeChange('rectangle'); }}>Rectangle</button>
      <button aria-pressed={mode === 'polygon'} onClick={() => { onError(''); onModeChange('polygon'); }}>Polygon</button>
      <button disabled={!area} aria-pressed={mode === 'select'} onClick={() => onModeChange('select')}>Edit area</button>
      <button disabled={!area && mode === 'static'} onClick={() => { dispatch({ type: 'filters', patch: { area: null } }); onModeChange('static'); onError(''); }}>Clear area</button>
      {mode !== 'static' && <button onClick={() => { onModeChange('static'); onError(''); }}>Done / cancel drawing</button>}
    </div>
    {mode !== 'static' && <p role="status" className="drawing-help">{mode === 'polygon' ? 'Click corners, then the first corner to finish. Escape cancels the current sketch.' : mode === 'rectangle' ? 'Click the first corner, then the opposite corner to finish.' : 'Drag the boundary or its handles. Use midpoints to add polygon corners.'} Drawing uses the flat map.</p>}
    <form key={coordinateKey} onSubmit={event => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const values = ['latitude', 'longitude', 'radius'].map(name => String(data.get(name) || ''));
      try { if (!values.every(value => value.trim())) throw new Error('Enter latitude, longitude, and radius.'); const selected = radiusArea(Number(values[0]), Number(values[1]), Number(values[2])); dispatch({ type: 'filters', patch: { area: selected } }); onModeChange('static'); onError(''); mapRef.current?.fitBounds(areaBounds(selected), { padding: 70, maxZoom: 12, pitch: 0 }); } catch (error) { onError(error instanceof Error ? error.message : 'Invalid location.'); }
    }}>
      <div className="coordinate-inputs">
        <label htmlFor={`${id}-lat`}>Latitude<input id={`${id}-lat`} name="latitude" type="number" step="any" min="-90" max="90" required defaultValue={center?.[1] ?? 35.759} /></label>
        <label htmlFor={`${id}-lng`}>Longitude<input id={`${id}-lng`} name="longitude" type="number" step="any" min="-180" max="180" required defaultValue={center?.[0] ?? -5.802} /></label>
        <label htmlFor={`${id}-radius`}>Radius (km)<input id={`${id}-radius`} name="radius" type="number" step="any" min="0.01" max="1000" required defaultValue={radius} /></label>
      </div>
      <button>Select location</button>
    </form>
    {error && <p className="dashboard-error" role="alert">{error}</p>}
    {area ? <div className="area-summary"><strong>{area.properties.kind === 'radius' ? `${area.properties.radiusKm} km radius` : `Selected ${area.properties.kind}`}</strong><button onClick={zoom}>Zoom to area</button><details><summary>Selected coordinates · longitude, latitude</summary><code>{JSON.stringify(area.geometry.coordinates[0].map(p => p.map(v => Number(v.toFixed(5)))))}</code></details></div> : <p className="filter-help">All locations · no area filter</p>}
  </div>;
}
