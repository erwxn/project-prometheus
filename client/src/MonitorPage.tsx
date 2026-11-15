import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { MapRef } from 'react-map-gl/maplibre';
import { SiteBrand, SiteNavigation } from './SiteHeader';
import { BasemapAppearance, MapAppearance } from './MapAppearance';
import { FireMap } from './FireMap';
import { SatelliteMarkerKey } from './SatelliteMarkerKey';
import { CountrySearch } from './CountrySearch';
import { AreaControls } from './DashboardControls';
import { useDashboard } from './dashboard-context';
import { useMonitorFeed } from './useMonitorFeed';
import { acquisitionTime, detectionAge, detectionKey, measuredPower, monitorFeedStatus, newestDetections, recentObservations, playbackObservations } from './monitor-model';
import { useMonitorHistory } from './useMonitorHistory';
import type { FireFeature } from './fire-data';
import { prepareObservations, selectScope } from './analytics-engine';
import type { DrawMode } from './analytics-model';
import { MapLoading } from './MapLoading';
import { DAY } from './timeline';
import type { ThemeProps } from './theme';
import { MoroccoPredictionPanel } from './MoroccoPredictionPanel';
import { predictionCells, predictionDates, preferredPredictionDate, type MoroccoPredictions } from './morocco-predictions';

const instant = (time: number | null) => time === null ? 'Not available' : new Date(time).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
const countFormat = new Intl.NumberFormat();
const powerFormat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });
const NO_DETECTIONS: FireFeature[] = [];
const MOROCCO_BOUNDS: [number, number, number, number] = [-17.11, 20.76, -0.99, 35.93];

function DetectionReadings({ feature, cursor }: { feature: FireFeature; cursor: number }) {
  const [longitude, latitude] = feature.geometry.coordinates;
  const power = measuredPower(feature);
  return <>
    <strong>{feature.properties.satellite}{feature.properties.platform && feature.properties.platform !== feature.properties.satellite ? ` · ${feature.properties.platform}` : ''}</strong>
    <span>{instant(acquisitionTime(feature))} · {detectionAge(feature, cursor)}</span>
    <span>{latitude.toFixed(4)}, {longitude.toFixed(4)} · {power === null ? 'Measured FRP unavailable' : `${powerFormat.format(power)} MW measured FRP`}</span>
  </>;
}

function DetectionPanel({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(() => !window.matchMedia('(max-width: 760px)').matches);
  return <details className="monitor-detections" open={open} onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>{title}</summary>
    {children}
  </details>;
}

export default function MonitorPage({ theme, setTheme, mapTheme, mapPreference, setMapPreference }: ThemeProps) {
  const { state, archive, openCalendar } = useDashboard();
  const feed = useMonitorFeed();
  const mapRef = useRef<MapRef>(null);
  const [mode, setMode] = useState<DrawMode>('static');
  const [drawingError, setDrawingError] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const [anchor, setAnchor] = useState<number | null>(null);
  const [minute, setMinute] = useState(1440);
  const [playing, setPlaying] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [showForecast, setShowForecast] = useState(false);
  const [forecastDate, setForecastDate] = useState('');
  const [forecastData, setForecastData] = useState<MoroccoPredictions | null>(null);
  const [forecastError, setForecastError] = useState('');
  const [forecastAttempt, setForecastAttempt] = useState(0);
  const [selectedProbability, setSelectedProbability] = useState<number | null>(null);
  const dates = useMemo(() => forecastData ? predictionDates(forecastData) : [], [forecastData]);
  const years = useMemo(() => [...new Set(dates.map(date => date.slice(0, 4)))], [dates]);
  const utcMonth = new Date(now).toISOString().slice(0, 7) + '-01';
  const date = dates.includes(forecastDate) ? forecastDate : preferredPredictionDate(dates, utcMonth);
  const yearDates = dates.filter(value => value.startsWith(date.slice(0, 4)));
  const overlay = useMemo(() => showForecast && forecastData && date ? predictionCells(forecastData, date) : undefined,
    [showForecast, forecastData, date]);
  useEffect(() => {
    if (!showForecast || forecastData) return;
    const controller = new AbortController();
    setForecastError('');
    async function load() {
      try {
        const response = await fetch(`${import.meta.env.BASE_URL}data/morocco-predictions.json`, { signal: controller.signal });
        if (!response.ok) throw new Error('Archive request failed.');
        const data = await response.json() as MoroccoPredictions;
        if (data.version !== 1 || !Array.isArray(data.bounds) || !Array.isArray(data.cells) || !data.monthly || !data.evaluation) {
          throw new Error('Archive data is invalid.');
        }
        if (!controller.signal.aborted) setForecastData(data);
      } catch {
        if (!controller.signal.aborted) setForecastError('Could not load the Morocco predictions.');
      }
    }
    void load();
    return () => controller.abort();
  }, [showForecast, forecastData, forecastAttempt]);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 15000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => setMinute(value => Math.min(1440, value + 15)), 1000);
    return () => clearInterval(timer);
  }, [playing]);
  const features = feed.collection?.features;
  const scoped = useMemo(() => selectScope(prepareObservations(features || []), { area: state.filters.area, country: state.filters.country, sensor: 'ALL' }).map(row => row.feature), [features, state.filters.area, state.filters.country]);
  const live = anchor === null;
  const end = anchor ?? now;
  const cursor = live ? now : end - DAY + minute * 60000;
  const visible = useMemo(() => live ? recentObservations(scoped, end) : playbackObservations(scoped, end, minute), [scoped, end, minute, live]);
  const detections = useMemo(() => newestDetections(visible), [visible]);
  const selected = selectedKey === null ? null : visible.find(feature => detectionKey(feature) === selectedKey) ?? null;
  if (selectedKey !== null && selected === null) setSelectedKey(null);
  const latest = useMemo(() => features?.reduce<number | null>((latestTime, feature) => {
    const time = acquisitionTime(feature);
    return Number.isFinite(time) ? Math.max(latestTime ?? time, time) : latestTime;
  }, null) ?? null, [features]);
  const status = monitorFeedStatus(feed.collection?.metadata, feed.loading, feed.error);
  const history = useMonitorHistory(now, state.filters.area, feed.collection, archive.catalog);
  const currentWeek = history.weeks[0].week;
  function selectDetection(feature: FireFeature | null, center = false) {
    setSelectedKey(feature ? detectionKey(feature) : null);
    if (feature && center) {
      const map = mapRef.current;
      map?.easeTo({ center: feature.geometry.coordinates, zoom: Math.max(6, map.getZoom()), duration: 0 });
    }
  }
  const freeze = () => { setAnchor(now); setMinute(0); setPlaying(true); };
  function zoomToArchive() {
    const [west, south, east, north] = forecastData?.bounds ?? MOROCCO_BOUNDS;
    mapRef.current?.fitBounds([[west, south], [east, north]], { padding: 48, pitch: 0, bearing: 0, duration: 0 });
  }
  function toggleForecast() {
    if (!showForecast) {
      setMode('static');
      setPlaying(false);
      setSelectedKey(null);
      zoomToArchive();
    }
    setSelectedProbability(null);
    setShowForecast(!showForecast);
  }
  return <div className="mission-app monitor-page" data-theme={theme}>
    <header className="mission-header"><SiteBrand /><SiteNavigation current="monitor" /><div className="challenge-tag">{showForecast ? 'Monthly predictions' : 'Last 24 hours'}</div><MapAppearance value={theme} onChange={setTheme} /></header>
    <main className="experience-workspace">
      <aside className="experience-rail">
        <h1>{showForecast ? 'Monitor modeled activity' : 'Monitor recent activity'}</h1>
        {!showForecast && <p>Follow satellite detections in your area over the last 24 hours.</p>}
        <MoroccoPredictionPanel active={showForecast} data={forecastData}
          error={forecastError} years={years} dates={yearDates} date={date}
          selected={selectedProbability} onToggle={toggleForecast} onRetry={() => setForecastAttempt(value => value + 1)}
          onYear={year => {
            const matchingDate = year + date.slice(4);
            setForecastDate(dates.includes(matchingDate) ? matchingDate : dates.find(value => value.startsWith(year)) ?? '');
            setSelectedProbability(null);
          }}
          onDate={value => { setForecastDate(value); setSelectedProbability(null); }} onZoom={zoomToArchive} />
        {!showForecast && <>
        <div className="monitor-source" role="status" aria-atomic="true"><strong>{status}</strong>
          {status === 'Update failed' && <p>{feed.collection ? 'Showing the last available snapshot.' : 'Waiting for a successful response.'}</p>}
        </div>
        <dl className="monitor-freshness"><dt>Source</dt><dd>{feed.collection?.metadata.source_name || feed.collection?.metadata.source || 'Not available'}</dd><dt>Last successful refresh</dt><dd>{instant(feed.checkedAt)}</dd><dt>Latest satellite acquisition</dt><dd>{instant(latest)}</dd><dt>Window starts</dt><dd>{instant(end - DAY)}</dd><dt>Window ends</dt><dd>{instant(end)}</dd></dl>
        {selected && <section className="monitor-selected" aria-label="Selected detection">
          <div className="monitor-detail-heading"><h2>Selected detection</h2><button type="button" onClick={() => selectDetection(null)}>Close</button></div>
          <div className="monitor-reading" role="status"><DetectionReadings feature={selected} cursor={cursor} /></div>
        </section>}
        <DetectionPanel title={live ? 'Latest detections' : 'Detections in this playback hour'}>
          {detections.length > 0 ? <ol className="monitor-detection-list">{detections.map((feature, index) => {
            const key = detectionKey(feature);
            return <li key={`${key}:${index}`}><button type="button" className="monitor-reading" aria-pressed={key === selectedKey} onClick={() => selectDetection(feature, true)}><DetectionReadings feature={feature} cursor={cursor} /></button></li>;
          })}</ol> : <p>{feed.loading ? 'Loading detections…' : 'No satellite detections in this window.'}</p>}
        </DetectionPanel>
        <AreaControls mapRef={mapRef} mode={mode} onModeChange={setMode} error={drawingError} onError={setDrawingError} />
        <section className="monitor-history" aria-labelledby="monitor-history-title">
          <h2 id="monitor-history-title">Compare with this time of year</h2>
          <p>{state.filters.area ? 'Selected area' : 'All locations'} · Seven completed UTC dates per year{history.source ? ` · ${history.source}` : ''}</p>
          {history.source ? <ul aria-busy={history.results === null}>{history.weeks.map(({ year, week }, index) => {
            const result = history.results?.[index];
            return <li key={year}>
              <strong>{year}{week ? ` · ${week.startDate} to ${week.endDate}` : ''}</strong>
              <span>{!week ? 'Unavailable · no February 29' : !history.results ? 'Loading…' : result === 'error' ? 'Archive request unavailable' : result?.count == null ? 'No recorded detections · coverage unknown' : `${countFormat.format(result.count)} detections · ${result.coverage === 'complete' ? `complete coverage · ${result.method}` : result.coverage === 'partial' ? `partial coverage · ${result.observedDays} days with detections` : 'recorded detections · coverage unknown'}`}</span>
            </li>;
          })}</ul> : <p>Comparison unavailable. Connect a harmonized series or load the local archive.</p>}
          {currentWeek && (history.platform || history.calendarCollection) && <button type="button" onClick={() => openCalendar(currentWeek, history.platform, history.calendarCollection, history.calendarSensor)}>Open burning calendar</button>}
        </section>
        </>}
      </aside>
      <section className="map-stage monitor-map" data-map-theme={mapTheme} aria-label={showForecast ? 'Morocco prediction map' : 'Recent fire monitoring map'}>
        <FireMap trackArchive={false} mapRef={mapRef} features={showForecast ? NO_DETECTIONS : visible}
          selectedFeature={showForecast ? null : selected}
          forecast={overlay} onSelectForecast={setSelectedProbability} onLoad={() => { if (showForecast) zoomToArchive(); }}
          onSelectFeature={showForecast ? undefined : selectDetection} theme={mapTheme} projection="mercator" mode={mode} onModeChange={setMode} onDrawingError={setDrawingError} />
        <div className="map-top-controls"><div className="map-heading"><h2>{showForecast ? (date ? `Morocco detection prediction · ${date.slice(0, 7)}` : 'Morocco detection prediction') : `${visible.length.toLocaleString()} recent detections`}</h2></div>
          {!showForecast && <CountrySearch onSelect={([,,bounds]) => { mapRef.current?.fitBounds(bounds, { padding: 90 }); return true; }} />}
          <BasemapAppearance value={mapPreference} onChange={setMapPreference} />
        </div>
        {showForecast && !overlay?.features.length && <p className="analytics-map-empty" role="status">{forecastError || (forecastData ? 'No predictions for this period.' : 'Loading predictions…')}</p>}
        {!showForecast && <>
        {feed.loading && <MapLoading />}
        {!!visible.length && <div className="platform-legend"><SatelliteMarkerKey features={visible} /></div>}
        {!feed.loading && !visible.length && <p className="analytics-map-empty">{feed.error ? 'Monitoring data is unavailable.' : live ? 'No loaded observations in the last 24 hours. This does not establish an absence of fires.' : 'No loaded detections in this playback hour.'}</p>}
        <div className="monitor-playback">
          <div><strong>{live ? 'Following now' : `Playback · ${instant(end - DAY + minute * 60000)}`}</strong><span>{live ? 'Rolling 24-hour window' : 'Showing the previous hour within a frozen 24-hour window'}</span></div>
          <div className="control-actions"><button onClick={() => { if (live) freeze(); else { if (minute >= 1440) setMinute(0); setPlaying(value => !value); } }}>{live ? 'Play previous 24 hours' : playing && minute < 1440 ? 'Pause' : 'Play'}</button><button disabled={live} onClick={() => { setAnchor(null); setPlaying(false); }}>Return to live</button></div>
          <input type="range" aria-label="Monitoring playback position" min="0" max="1440" step="15" value={live ? 1440 : minute} onChange={event => { if (live) setAnchor(now); setMinute(Number(event.target.value)); setPlaying(false); }} />
        </div>
        </>}
      </section>
    </main>
  </div>;
}
