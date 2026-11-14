import { useState, useEffect, useMemo, useRef } from 'react';
import type { MapRef } from 'react-map-gl/maplibre';
import { MINUTE, STEP_MINUTES, observationTime, defaultWindowStart, fileWindow, matchesTime, nextDetectionMinute, type TimeBasis } from './timeline';
import { type FireFeature } from './fire-data';
import { observationFrp, type DrawMode, type SensorFilter } from './analytics-model';
import { selectRange, dateTime } from './analytics-engine';
import { areaBounds } from './area-selection';
import { useDashboard } from './dashboard-context';
import { AreaControls, DatasetControls, GlobalFilters } from './DashboardControls';
import { FireMap } from './FireMap';
import { FireObservations } from './FireObservations';
import { SiteBrand, SiteNavigation } from './SiteHeader';
import { CountrySearch } from './CountrySearch';
import type { Country } from './country-bounds';
import orbitalStars from './assets/orbital-stars.svg';

export default function App() {
  const { state, dispatch, selected, scope, retry, archive } = useDashboard();
  const allFires = state.collection.features;
  const dataMeta = state.collection.metadata;
  const backendStatus = state.status === 'loading' ? 'checking' : state.status === 'error' ? 'fallback' : 'online';
  const selectedSatellite = state.filters.sensor;
  const setSelectedSatellite = (sensor: SensorFilter) => !archive.active && dispatch({ type: 'filters', patch: { sensor } });
  const mapRef = useRef<MapRef>(null);
  const [mapReady, setMapReady] = useState(false);
  const [drawMode, setDrawMode] = useState<DrawMode>('static');
  const [drawingError, setDrawingError] = useState('');
  const [timeScope, setTimeScope] = useState<'day' | 'file'>('day');
  const [timeBasis, setTimeBasis] = useState<TimeBasis>('utc');
  const [windowStartOverride, setWindowStartOverride] = useState<number | null>(null);
  const [cursorMinute, setCursorMinute] = useState(1440);
  const [allHoursMode, setAllHoursMode] = useState(true);
  const [selectedFire, setSelectedFire] = useState<FireFeature | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showTimeline, setShowTimeline] = useState(true);
  const [timelineSize, setTimelineSize] = useState('compact');
  const [showTimelineOptions, setShowTimelineOptions] = useState(false);
  const [activeRegion, setActiveRegion] = useState('Global');
  const [mapTheme, setMapTheme] = useState<'dark' | 'light'>('dark');
  const [mapProjection, setMapProjection] = useState<'mercator' | 'globe'>('mercator');
  const changeDrawMode = (mode: DrawMode) => { if (mode !== 'static') setMapProjection('mercator'); setDrawMode(mode); };
  const switchProjection = (projection: typeof mapProjection) => { setDrawMode('static'); setMapProjection(projection); };
  const [previousCollection, setPreviousCollection] = useState(allFires);
  if (previousCollection !== allFires) {
    setPreviousCollection(allFires);
    setTimeBasis('utc'); setTimeScope('day'); setWindowStartOverride(null);
    setCursorMinute(1440); setIsPlaying(false); setAllHoursMode(true); setSelectedFire(null);
  }
  const [previousDay, setPreviousDay] = useState(state.filters.selectedDay);
  if (previousDay !== state.filters.selectedDay) { setPreviousDay(state.filters.selectedDay); if (state.filters.selectedDay) { setTimeBasis('utc'); setCursorMinute(1440); setIsPlaying(false); setAllHoursMode(true); } }
  const { startDate, endDate } = state.filters;
  const rangeKey = `${startDate}:${endDate}`;
  const [previousRange, setPreviousRange] = useState(rangeKey);
  if (previousRange !== rangeKey) { setPreviousRange(rangeKey); setWindowStartOverride(null); setIsPlaying(false); setAllHoursMode(true); }

  // Both the map and CSV load asynchronously; frame the loaded data once both are ready.
  useEffect(() => {
    if (!mapReady || !allFires.length || archive.active) return;
    if (state.filters.area) { mapRef.current?.fitBounds(areaBounds(state.filters.area), { padding: { top: 130, bottom: 180, left: 40, right: 60 }, pitch: 0, maxZoom: 12, duration: 0 }); return; }
    const coordinates = allFires.map(fire => fire.geometry.coordinates);
    const lngs = coordinates.map(point => point[0]);
    const lats = coordinates.map(point => point[1]);
    mapRef.current?.fitBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]], {
      padding: { top: 140, bottom: Math.min((document.querySelector<HTMLElement>('.timeline-panel')?.offsetHeight ?? 320) + 48, (mapRef.current?.getMap().getContainer().clientHeight ?? 600) * .65), left: 35, right: 55 },
      maxZoom: 7, pitch: 0, duration: 0
    });
  }, [allFires, mapReady, state.filters.area, archive.active]);

  const hasDates = useMemo(() => allFires.some(fire => !!fire.properties.observed_at_utc), [allFires]);
  const timelineFires = useMemo(() => selectRange(scope, { startDate, endDate, selectedDay: null }, false).map(row => row.feature), [scope, startDate, endDate]);
  const defaultStart = useMemo(() => defaultWindowStart(timelineFires, timeBasis), [timelineFires, timeBasis]);
  const timestamps = useMemo(() => new globalThis.Map(allFires.map(fire => [fire, observationTime(fire, timeBasis)])), [allFires, timeBasis]);
  const fileBounds = useMemo(() => fileWindow(timelineFires, timeBasis), [timelineFires, timeBasis]);
  const durationMinutes = state.filters.selectedDay ? 1440 : timeScope === 'file' ? fileBounds.durationMinutes : 1440;
  const cursorPosition = Math.min(cursorMinute, durationMinutes);
  const windowStart = state.filters.selectedDay ? dateTime(state.filters.selectedDay) : timeScope === 'file' ? fileBounds.start : windowStartOverride ?? defaultStart;
  const windowEnd = windowStart + durationMinutes * MINUTE;
  const cursorTime = windowStart + cursorPosition * MINUTE;
  const rangeStart = allHoursMode ? windowStart : Math.max(windowStart, cursorTime - 60 * MINUTE);
  const rangeEnd = allHoursMode ? windowEnd : cursorTime;
  const basisLabel = timeBasis === 'utc' ? 'UTC' : 'Local mean solar time';
  const clockFormat = useMemo(() => new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'UTC' }), []);
  const dateFormat = useMemo(() => new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }), []);
  const formatInstant = (time: number) => `${hasDates ? `${dateFormat.format(time)}, ` : ''}${clockFormat.format(time)}`;
  const datasetFires = useMemo(() => selected.map(row => row.feature), [selected]);
  const filteredFires = useMemo(() => datasetFires.filter(fire => matchesTime(timestamps.get(fire) ?? NaN, windowStart, cursorPosition, allHoursMode, durationMinutes)), [datasetFires, timestamps, windowStart, cursorPosition, allHoursMode, durationMinutes]);
  const datasetTimes = useMemo(() => datasetFires.map(fire => timestamps.get(fire) ?? NaN), [datasetFires, timestamps]);
  const nextMinute = useMemo(() => nextDetectionMinute(datasetTimes, windowStart, cursorPosition, durationMinutes), [datasetTimes, windowStart, cursorPosition, durationMinutes]);
  const activeFire = selectedFire && filteredFires.includes(selectedFire) ? selectedFire : null;
  const switchTimeBasis = (basis: TimeBasis) => {
    dispatch({ type: 'filters', patch: { selectedDay: null } });
    setTimeBasis(basis); setWindowStartOverride(null); setAllHoursMode(true); setIsPlaying(false); setCursorMinute(timeScope === 'file' ? fileWindow(timelineFires, basis).durationMinutes : 1440);
  };
  const switchTimeScope = (scope: 'day' | 'file') => {
    dispatch({ type: 'filters', patch: { selectedDay: null } });
    setTimeScope(scope); setCursorMinute(scope === 'file' ? fileBounds.durationMinutes : 1440);
    setAllHoursMode(true); setIsPlaying(false);
  };
  useEffect(() => {
    if (!isPlaying) return;
    const timer = window.setInterval(() => setCursorMinute(previous => previous >= durationMinutes ? Math.min(STEP_MINUTES, durationMinutes) : Math.min(previous + STEP_MINUTES, durationMinutes)), 1100);
    return () => window.clearInterval(timer);
  }, [isPlaying, durationMinutes]);

  const showWholeWindow = () => { setSelectedSatellite('ALL'); setAllHoursMode(true); setIsPlaying(false); };

  const stats = useMemo(() => {
    const readings = filteredFires.map(observationFrp).filter((value): value is number => value !== null);
    return { count: filteredFires.length, peakFrp: readings.length ? readings.reduce((peak, value) => Math.max(peak, value), 0).toFixed(1) : '—', avgNormalizedFrp: readings.length ? (readings.reduce((sum, value) => sum + value, 0) / readings.length).toFixed(1) : '—' };
  }, [filteredFires]);

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
    const windowMetadata = hasDates ? { explorer_from: new Date(rangeStart).toISOString(), explorer_to_exclusive: new Date(rangeEnd).toISOString() } : { undated: true, relative_minutes: [rangeStart / MINUTE, rangeEnd / MINUTE] };
    const blob = new Blob([JSON.stringify({ type: 'FeatureCollection', metadata: { ...dataMeta, total_features: filteredFires.length, filters: state.filters, archive_selection: archive.active ? {platform:archive.platform,startDate:state.filters.startDate,endDate:state.filters.endDate} : undefined, export_scope: 'loaded map observations', explorer_clock: timeBasis, ...windowMetadata }, features: filteredFires }, null, 2)], { type: 'application/geo+json' });
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

      {dataMeta.source === 'simulated' && <div className="simulation-banner" role="status">SIMULATED HISTORY · Synthetic examples, not NASA observations.</div>}
      <main className="mission-workspace">
        <aside className="analysis-panel" aria-label="Fire analysis controls">
          <div className="panel-intro">
            <span className="intro-planet" aria-hidden="true" />

            <h2>Every hotspot.<br />A clearer picture.</h2>
            <p>Explore fire activity across the diurnal cycle. Compare satellite observations and harmonized estimates.</p>
            <div className={`data-status ${backendStatus}`} role="status">
              <span className="status-dot" />
              {backendStatus === 'online' ? dataMeta.source === 'csv' ? 'Imported observations' : dataMeta.source === 'simulated' ? 'Simulated history' : 'Demo API connected' : backendStatus === 'checking' ? 'Connecting to data source' : dataMeta.source === 'csv' ? 'API unavailable · loaded snapshot kept' : 'API unavailable · illustrative demo shown'}
              <span className="status-label">{backendStatus === 'online' ? dataMeta.source === 'csv' ? 'CSV' : 'DEMO' : backendStatus === 'checking' ? 'WAIT' : 'SAMPLE'}</span>
            </div>
            {backendStatus === 'fallback' && <button className="retry-data" onClick={() => void retry()}>Retry real data</button>}
          </div>

          <section className="panel-section shared-controls"><DatasetControls /></section>
          <section className="panel-section shared-controls"><AreaControls mapRef={mapRef} mode={drawMode} onModeChange={changeDrawMode} error={drawingError} onError={setDrawingError} /></section>
          <section className="panel-section shared-controls"><h3>Shared filters</h3><GlobalFilters compact /></section>
          {dataMeta.source === 'csv' && <section className="panel-section imported-data" aria-label="Imported observation dataset">
            <h3>{dataMeta.uploaded ? 'Uploaded observation snapshot' : 'Imported observation snapshot'}</h3>
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
            {timeScope === 'file' && <p>Entire file: {formatInstant(fileBounds.start)} – {formatInstant(fileBounds.start + (fileBounds.durationMinutes - 1) * MINUTE)} {basisLabel}. Shared area, UTC date, and sensor filters apply.</p>}
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
                <button key={source.id} disabled={archive.active} className={`source-option ${selectedSatellite === source.id ? 'selected' : ''}`} aria-pressed={selectedSatellite === source.id} onClick={() => setSelectedSatellite(source.id)}>
                  <span className="source-badge">{source.badge}</span><span className="source-text"><strong>{source.label}</strong><small>{source.detail}</small></span><span className="selection-dot" />
                </button>
              ))}
            </div>
          </section>

          <FireObservations fires={filteredFires} timeBasis={timeBasis} selected={activeFire} onSelect={locateFire} onFit={fitHotspots} />
          <div className="panel-footer"><p>One planet. Multiple perspectives.<br /><span>MODIS + VIIRS / Diurnal harmonization</span></p></div>
        </aside>

        <section className="map-stage" data-projection={mapProjection} aria-label="Interactive fire observation map">
          {mapProjection === 'globe' && <img className="orbital-stars" src={orbitalStars} alt="" aria-hidden="true" draggable={false} />}
          {filteredFires.length === 0 && drawMode === 'static' && <div className="map-empty" role="status"><strong>{dataMeta.source === 'csv' && selectedSatellite !== 'ALL' && selectedSatellite !== 'MODIS' ? 'Selected sensor is unavailable in this slice' : 'No matching detections in this dataset'}</strong><span>This does not mean there were no fires. Try another dataset, time window, or Next detection.</span><button onClick={() => { showWholeWindow(); }}>{timeScope === 'file' ? 'View entire file' : 'View all selected 24 hours'}</button></div>}
          <FireMap mapRef={mapRef} features={filteredFires} selectedFeature={activeFire} onSelectFeature={feature => { setSelectedFire(feature); setIsPlaying(false); }} theme={mapTheme} projection={mapProjection} mode={drawMode} onModeChange={changeDrawMode} onDrawingError={setDrawingError} onLoad={() => setMapReady(true)} />
          <div className="map-top-controls">
            <div className="map-heading"><h2>{state.filters.area ? 'Selected area' : activeRegion === 'Global' ? 'Global fire activity' : activeRegion} <span>/ {mapProjection === 'globe' ? 'Globe' : 'Flat map'}</span></h2><span className="mobile-data-status">{dataMeta.source === 'simulated' ? 'SIMULATED HISTORY' : backendStatus === 'online' ? 'BACKEND CONNECTED' : backendStatus === 'checking' ? 'CONNECTING' : 'DEMO DATASET'}</span></div>
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
            <dl><div><dt>{activeFire.properties.satellite.toLowerCase().includes('harmonized') ? 'Estimated FRP' : 'Measured FRP'}</dt><dd>{observationFrp(activeFire)?.toFixed(1) ?? 'Unavailable'} MW</dd></div>
            <div><dt>Acquired UTC</dt><dd>{activeFire.properties.observed_at_utc ? activeFire.properties.observed_at_utc.replace('T', ' ').slice(0, 16) : `${activeFire.properties.acq_time_utc} · Undated demo`}</dd></div></dl>
            <p>Observation point, not a fire perimeter.</p>
          </section>}
          <div className="thermal-legend" hidden={!!activeFire} aria-label="Fire radiative power color scale">
            <p className="marker-key"><span className="fire-dot" aria-hidden="true" /> {dataMeta.source === 'csv' ? 'MODIS detection' : dataMeta.source === 'simulated' ? 'SIMULATED observation' : 'Sample fire observation'}</p><div><span>Fire radiative power</span><span>MW</span></div><div className="thermal-ramp" /><div className="legend-values"><span>&lt;50</span><span>50–150</span><span>&gt;150 MW</span></div><p className="marker-note">Color shows FRP. Points are not fire size.</p>
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
                      <option value="file">Full filtered file</option>
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
                    {compactTimeline && <select disabled={archive.active} aria-label="Satellite dataset layers" value={selectedSatellite} onChange={e => {
                        const source = timelineSources.find(source => source.id === e.target.value);
                        if (source) setSelectedSatellite(source.id);
                      }}>
                        {timelineSources.map(source => <option key={source.id} value={source.id}>{source.id === 'ALL' ? 'All layers' : source.label}</option>)}
                      </select>}
                  </div>
                  {!compactTimeline && <div className="dataset-pills" role="group" aria-label="Satellite dataset layers">
                    {timelineSources.map(source => <button disabled={archive.active} key={source.id} aria-pressed={selectedSatellite === source.id} onClick={() => setSelectedSatellite(source.id)}>{source.label}</button>)}
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
