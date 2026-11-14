import { useEffect, useMemo, useRef, useState } from 'react';
import type { MapRef } from 'react-map-gl/maplibre';
import { SiteBrand, SiteNavigation } from './SiteHeader';
import { MapAppearance } from './MapAppearance';
import { FireMap } from './FireMap';
import { CountrySearch } from './CountrySearch';
import { AreaControls } from './DashboardControls';
import { useDashboard } from './dashboard-context';
import { useMonitorFeed } from './useMonitorFeed';
import { recentObservations, playbackObservations } from './monitor-model';
import { prepareObservations, selectScope } from './analytics-engine';
import type { DrawMode } from './analytics-model';
import { MapLoading } from './MapLoading';
import { DAY } from './timeline';

const instant = (time: number | null) => time === null ? 'Not available' : new Date(time).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';

export default function MonitorPage() {
  const { state } = useDashboard();
  const feed = useMonitorFeed();
  const mapRef = useRef<MapRef>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [mode, setMode] = useState<DrawMode>('static');
  const [drawingError, setDrawingError] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const [anchor, setAnchor] = useState<number | null>(null);
  const [minute, setMinute] = useState(1440);
  const [playing, setPlaying] = useState(false);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 15000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => setMinute(value => Math.min(1440, value + 15)), 1000);
    return () => clearInterval(timer);
  }, [playing]);
  const features = feed.collection?.features;
  const scoped = useMemo(() => selectScope(prepareObservations(features || []), { area: state.filters.area, sensor: 'ALL' }).map(row => row.feature), [features, state.filters.area]);
  const live = anchor === null;
  const end = anchor ?? now;
  const visible = useMemo(() => live ? recentObservations(scoped, end) : playbackObservations(scoped, end, minute), [scoped, end, minute, live]);
  const latest = features?.reduce<number | null>((latest, f) => { const time = Date.parse(f.properties.observed_at_utc || ''); return Number.isFinite(time) ? Math.max(latest ?? time, time) : latest; }, null) ?? null;
  const connected = feed.collection?.metadata.live === true;
  const freeze = () => { setAnchor(now); setMinute(0); setPlaying(true); };
  return <div className="mission-app monitor-page" data-theme={theme}>
    <header className="mission-header"><SiteBrand /><SiteNavigation current="monitor" /><div className="challenge-tag">Last 24 hours</div><MapAppearance value={theme} onChange={setTheme} /></header>
    <main className="experience-workspace">
      <aside className="experience-rail">
        <h1>Monitor recent activity</h1>
        <p>Follow satellite detections in your area over the last 24 hours.</p>
        <div className="monitor-source" role="status"><strong>{connected ? 'Live feed connected' : 'Live feed not connected yet'}</strong><p>{connected ? 'Updates are requested every minute.' : 'The current endpoint supplies test or historical data. Older records are excluded from this view.'}</p></div>
        <dl className="monitor-freshness"><dt>Last successful refresh</dt><dd>{instant(feed.checkedAt)}</dd><dt>Latest observation in feed</dt><dd>{instant(latest)}</dd><dt>Window starts</dt><dd>{instant(end - DAY)}</dd><dt>Window ends</dt><dd>{instant(end)}</dd></dl>
        {feed.error && <p role="alert">{feed.error}</p>}
        <AreaControls mapRef={mapRef} mode={mode} onModeChange={setMode} error={drawingError} onError={setDrawingError} />
      </aside>
      <section className="map-stage monitor-map" aria-label="Recent fire monitoring map">
        <FireMap trackArchive={false} mapRef={mapRef} features={visible} theme={theme} projection="mercator" mode={mode} onModeChange={setMode} onDrawingError={setDrawingError} />
        <div className="map-top-controls"><div className="map-heading"><h2>{visible.length.toLocaleString()} recent detections</h2></div><CountrySearch onSelect={([,,bounds]) => { mapRef.current?.fitBounds(bounds, { padding: 90 }); return true; }} /></div>
        {feed.loading && <MapLoading />}
        {!feed.loading && !visible.length && <p className="analytics-map-empty">{feed.error ? 'Monitoring data is unavailable.' : live ? 'No loaded observations in the last 24 hours. This does not establish an absence of fires.' : 'No loaded detections in this playback hour.'}</p>}
        <div className="monitor-playback">
          <div><strong>{live ? 'Following now' : `Playback · ${instant(end - DAY + minute * 60000)}`}</strong><span>{live ? 'Rolling 24-hour window' : 'Showing the previous hour within a frozen 24-hour window'}</span></div>
          <div className="control-actions"><button onClick={() => { if (live) freeze(); else { if (minute >= 1440) setMinute(0); setPlaying(value => !value); } }}>{live ? 'Play previous 24 hours' : playing && minute < 1440 ? 'Pause' : 'Play'}</button><button disabled={live} onClick={() => { setAnchor(null); setPlaying(false); }}>Return to live</button></div>
          <input type="range" aria-label="Monitoring playback position" min="0" max="1440" step="15" value={live ? 1440 : minute} onChange={event => { if (live) setAnchor(now); setMinute(Number(event.target.value)); setPlaying(false); }} />
        </div>
      </section>
    </main>
  </div>;
}
