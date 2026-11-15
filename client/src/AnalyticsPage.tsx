import { SearchExport } from './SearchExport';
import { SeasonalHeatmap } from './SeasonalHeatmap';
import { DatasetStatus } from './DatasetStatus';
import { MapLoading } from './MapLoading';
import { mapFeedback } from './map-feedback';
import { MapAppearance } from './MapAppearance';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { MapRef } from 'react-map-gl/maplibre';
import { SiteBrand, SiteNavigation } from './SiteHeader';
import { summarizeObservations } from './fire-analytics';
import type { TimeBasis } from './timeline';
import { useDashboard } from './dashboard-context';
import { AreaControls, DatasetControls, GlobalFilters } from './DashboardControls';
import { FireMap } from './FireMap';
import { ActivityCalendar } from './ActivityCalendar';
import { HistoricalActivity } from './HistoricalActivity';
import { CountrySearch } from './CountrySearch';
import { areaBounds } from './area-selection';
import { metricUnit, type DrawMode } from './analytics-model';
import { archiveFeature } from './archive-model';
import orbitalStars from './assets/orbital-stars.svg';

const whole = new Intl.NumberFormat();
const decimal = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });
const hourLabel = (hour: number) => `${String(hour).padStart(2, '0')}:00`;
const formatPower = (value: number | null) => value === null ? '—' : `${decimal.format(value)} MW`;

const analysisSections = [
  ['analysis-filters', 'Filters'],
  ['calendar-title', 'Calendar'],
  ['seasonal-title', 'Seasonality'],
  ['history-title', 'Comparison'],
  ['analysis-export', 'Export'],
  ['details-title', 'Details'],
] as const;

function AnalysisNavigation() {
  const nav = useRef<HTMLElement>(null);
  const [activeSection, setActiveSection] = useState<string | null>(null);

  useEffect(() => {
    const navigation = nav.current;
    if (!navigation) return;
    const targets = analysisSections.map(([id]) => document.getElementById(id));
    let frame = 0;
    function update() {
      frame = 0;
      const edge = (navigation?.getBoundingClientRect().bottom ?? 0) + 40;
      let active: string | null = null;
      for (const target of targets) {
        if (target && target.getBoundingClientRect().top <= edge) active = target.id;
      }
      setActiveSection(active);
    }
    function scheduleUpdate() {
      if (!frame) frame = window.requestAnimationFrame(update);
    }
    const resize = new ResizeObserver(scheduleUpdate);
    resize.observe(navigation.parentElement!);
    window.addEventListener('scroll', scheduleUpdate, { passive: true });
    window.addEventListener('resize', scheduleUpdate);
    scheduleUpdate();
    return () => {
      resize.disconnect();
      window.removeEventListener('scroll', scheduleUpdate);
      window.removeEventListener('resize', scheduleUpdate);
      window.cancelAnimationFrame(frame);
    };
  }, []);

  return <nav className="analytics-jump-nav" aria-label="Analyze sections" ref={nav}>
    {analysisSections.map(([id, label]) => <a key={id} href={`#${id}`} aria-current={id === activeSection ? 'location' : undefined}>{label}</a>)}
  </nav>;
}

function HourlyChart({ hours, clock }: { hours: number[]; clock: string }) {
  const maxCount = Math.max(...hours, 1);
  const yStep = Math.max(1, Math.ceil(maxCount / 4));
  const ceiling = yStep * 4;
  const grid = [0, 1, 2, 3, 4];

  return (
    <>
      <svg className="analytics-hour-chart" viewBox="0 0 560 190" role="img" aria-labelledby="hour-chart-title hour-chart-description">
        <title id="hour-chart-title">Detections by {clock} hour</title>
        <desc id="hour-chart-description">One bar per hour, with detection counts starting at zero. Exact counts are available in the hourly data table.</desc>
        {grid.map(index => {
          const y = 160 - index * 36;
          return <g key={index}><line x1="55" x2="550" y1={y} y2={y} /><text x="48" y={y + 4} textAnchor="end">{whole.format(index * yStep)}</text></g>;
        })}
        {hours.map((count, hour) => {
          const height = count / ceiling * 144;
          return <rect key={hour} x={58 + hour * 20.5} y={160 - height} width="14" height={height} rx="2"><title>{hourLabel(hour)} {clock} · {whole.format(count)} detections</title></rect>;
        })}
        {[0, 6, 12, 18, 23].map(hour => <text key={hour} x={65 + hour * 20.5} y="181" textAnchor="middle">{hourLabel(hour)}</text>)}
      </svg>
      <details className="analytics-hour-details">
        <summary>View hourly counts</summary>
        <table className="analytics-table">
          <caption>Detection counts by {clock} hour</caption>
          <thead><tr><th scope="col">Hour</th><th scope="col">Detections</th></tr></thead>
          <tbody>{hours.map((count, hour) => <tr key={hour}><th scope="row">{hourLabel(hour)}</th><td>{whole.format(count)}</td></tr>)}</tbody>
        </table>
      </details>
    </>
  );
}

function Breakdown({ rows, total }: { rows: { label: string; count: number }[]; total: number }) {
  return (
    <ul className="analytics-breakdown">
      {rows.map(row => <li key={row.label}>
        <div><span>{row.label}</span><strong>{whole.format(row.count)}</strong></div>
        <meter min="0" max={Math.max(total, 1)} value={row.count} aria-label={row.label} />
      </li>)}
    </ul>
  );
}

export default function AnalyticsPage() {
  const { camera, state, selected, summary, archive } = useDashboard();
  const [basis, setBasis] = useState<TimeBasis>('utc');
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [projection, setProjection] = useState<'mercator' | 'globe'>('mercator');
  const [mode, setMode] = useState<DrawMode>('static');
  const [drawingError, setDrawingError] = useState('');
  const [mapReady, setMapReady] = useState(false);
  const mapRef = useRef<MapRef>(null);
  const restoreCamera = useRef(camera.current !== null);
  const features = useMemo(() => selected.map(row => row.feature), [selected]);
  const localStats = useMemo(() => summarizeObservations(features, 'ALL', '', basis), [features, basis]);
  const stats = useMemo(()=>{
    if(!archive.active)return localStats;
    if(!archive.data)return summarizeObservations([], 'ALL', '', basis);
    const days=archive.data.daily.filter(d=>!state.filters.selectedDay||d.date===state.filters.selectedDay);
    const hours=Array<number>(24).fill(0),bands=[0,0,0],sources:Record<string,number>={};
    for(const d of days){for(let h=0;h<24;h++)hours[h]+=(basis==='utc'?d.hours:d.solarHours)[h];for(let b=0;b<3;b++)bands[b]+=d.bands[b];for(const [k,v]of Object.entries(d.sources))sources[k]=(sources[k]||0)+v;}
    const strongest=days.flatMap(d=>d.strongest).sort((a,b)=>b.frp-a.frp).slice(0,8).map(r=>({feature:archiveFeature(r),frp:r.frp,label:r.sensor}));
    return {...localStats,count:summary.count,timedCount:summary.count,hours,sources:Object.entries(sources).map(([label,count])=>({label,count})),bands:['Below 50 MW','50–150 MW','Above 150 MW'].map((label,i)=>({label,count:bands[i]})),strongest,frpCount:summary.frpCount,meanFrp:summary.meanFrp,peakFrp:summary.maxFrp};
  },[archive.active,archive.data,localStats,state.filters.selectedDay,basis,summary]);
  const clock = basis === 'utc' ? 'UTC' : 'local mean solar time';
  const loading = state.status === 'loading' || archive.busy || (archive.active && !archive.data);
  const mapState = mapFeedback(state.status === 'loading' || archive.mapLoading, archive.active ? archive.error : state.error, features.length);
  const changeMode = (next: DrawMode) => { if (next !== 'static') setProjection('mercator'); setMode(next); };
  useEffect(() => {
    if (!mapReady || archive.active || restoreCamera.current) return;
    if (state.filters.area) { mapRef.current?.fitBounds(areaBounds(state.filters.area), { padding: 65, pitch: 0, maxZoom: 12, duration: 0 }); return; }
    const coordinates = state.collection.features.map(f => f.geometry.coordinates);
    if (!coordinates.length) return;
    let west = Infinity, south = Infinity, east = -Infinity, north = -Infinity;
    for (const [lng, lat] of coordinates) { west = Math.min(west, lng); south = Math.min(south, lat); east = Math.max(east, lng); north = Math.max(north, lat); }
    mapRef.current?.fitBounds([[west, south], [east, north]], { padding: { top: 110, bottom: 65, left: 35, right: 55 }, maxZoom: 8, pitch: 0, duration: 0 });
  }, [mapReady, state.collection, state.filters.area, archive.active]);

  return <div className="mission-app analytics-page" data-theme={theme}>
    <header className="mission-header"><SiteBrand /><SiteNavigation current="analytics" /><div className="challenge-tag"><span className="tiny-orbit" aria-hidden="true" />NASA Space Apps</div><MapAppearance value={theme} onChange={setTheme} /></header>
    {state.collection.metadata.source === 'simulated' && <div className="simulation-banner" role="status">SIMULATED HISTORY · Synthetic examples, not NASA satellite observations.</div>}
    <main className="analytics-content">
      <section className="analytics-hero" aria-labelledby="analytics-title">
        <div className="analytics-hero-copy">
          <h1 id="analytics-title">Fire analytics</h1>
          <p>Explore satellite hotspots across a region, read the burning calendar, and compare fire activity across years.</p>
        </div>
      </section>
      <dl className="analytics-metrics" aria-label="Fire statistics" aria-busy={loading}>
        <div><dt>Total hotspot detections</dt><dd>{loading ? '—' : whole.format(summary.count)}<small>Satellite records matching the filters</small></dd></div>
        <div><dt>Active observation days</dt><dd>{loading || summary.activeDays === null ? '—' : whole.format(summary.activeDays)}<small>{summary.activeDays === null ? 'Acquisition dates unavailable' : 'UTC days with at least one detection'}</small></dd></div>
        <div><dt>Average FRP</dt><dd>{loading ? '—' : formatPower(summary.meanFrp)}<small>{whole.format(summary.frpCount)} valid readings{state.filters.sensor === 'Harmonized' ? ' · stored estimates' : ' · measured FRP'}</small></dd></div>
        <div><dt>Peak activity day</dt><dd className="peak-day" title={summary.peakDays.join(', ')}>{loading ? '—' : summary.peakDays[0] || '—'}<small>{summary.peak === null ? 'No dated activity value available' : `${decimal.format(summary.peak)} ${metricUnit(state.filters.metric)}${summary.peakDays.length > 1 ? ` · ${summary.peakDays.length} days tied` : ''}`}</small></dd></div>
      </dl>
      <AnalysisNavigation />
      {state.filters.selectedDay && <p className="selected-day-note" role="status">Map and summaries focus on {state.filters.selectedDay} UTC. Calendar and historical charts retain the selected range.</p>}
      <section className="analytics-query" aria-labelledby="analysis-filters">
        <h2 id="analysis-filters">Region and filters</h2>
        <DatasetControls />
        <GlobalFilters />
        <div className="analytics-map-layout">
        <section className="map-stage analytics-map" data-projection={projection} aria-label="Analytics fire observation map">
          {projection === 'globe' && <img className="orbital-stars" src={orbitalStars} alt="" aria-hidden="true" draggable={false} />}
          <FireMap mapRef={mapRef} features={features} theme={theme} projection={projection} mode={mode} onModeChange={changeMode} onDrawingError={setDrawingError} onLoad={() => setMapReady(true)} />
          <div className="map-top-controls"><div className="map-heading"><h2>{state.filters.area ? 'Selected area' : 'All locations'} <span>/ {whole.format(features.length)} detections</span></h2></div><CountrySearch onSelect={([, , bounds]) => { if (!mapRef.current) return false; mapRef.current.fitBounds(bounds, { padding: 75, pitch: 0, maxZoom: 9 }); return true; }} /><div className="projection-switch" role="group" aria-label="Map projection"><button aria-pressed={projection === 'mercator'} onClick={() => { setMode('static'); setProjection('mercator'); }}>Flat map</button><button aria-pressed={projection === 'globe'} onClick={() => { setMode('static'); setProjection('globe'); }}>3D globe</button></div></div>
          {mode !== 'static' && <p className="map-drawing-status" role="status">{mode === 'select' ? 'Editing selected area' : `Drawing ${mode}`} · Finish or cancel in the area controls</p>}
          {mapState === 'loading' && <MapLoading />}
          {mapState === 'error' && <p className="analytics-map-empty" role="alert">Map observations could not be loaded. Use Retry archive in the filters to try again.</p>}
          {mapState === 'empty' && mode === 'static' && <p className="analytics-map-empty" role="status">No matching detections in the loaded snapshot. This does not establish an absence of fires.</p>}
          <div className="map-activity-caption">{state.collection.metadata.source === 'simulated' ? 'SIMULATED' : state.collection.metadata.source === 'csv' ? 'IMPORTED SNAPSHOT' : 'ILLUSTRATIVE DEMO'} · {state.filters.sensor} · Points show detections, not fire perimeters</div>
        </section>
        <aside className="analytics-area-panel" aria-label="Geographic area selection"><AreaControls mapRef={mapRef} mode={mode} onModeChange={changeMode} error={drawingError} onError={setDrawingError} /></aside>
        </div>
        <details className="analytics-provenance">
          <summary>Dataset provenance and coverage</summary>
          <DatasetStatus />
        </details>
      </section>
      {!loading && !summary.count && <p className="dashboard-unavailable" role="status">No recorded detections match these filters. Change the area, sensor, dates, or selected day. Unknown coverage is not a known zero.</p>}
      <ActivityCalendar />
      <SeasonalHeatmap />
      <HistoricalActivity />
      <div id="analysis-export"><SearchExport /></div>
      <section className="dashboard-section observation-analytics" aria-labelledby="details-title"><div className="section-toolbar"><div><h2 id="details-title">Observation details</h2><p>Hourly timing, source breakdown, FRP distribution, and strongest readings for the focused selection.</p></div><label>Hourly chart clock<select value={basis} onChange={e => setBasis(e.target.value as TimeBasis)}><option value="utc">UTC</option><option value="solar">Local mean solar time</option></select></label></div>
          <div className="analytics-grid">
            <section className="analytics-card" aria-labelledby="hourly-title">
              <h2 id="hourly-title">Detections by hour</h2>
              <p>Grouped by {clock} hour of day across the selected records.</p>
              {stats.timedCount ? <HourlyChart hours={stats.hours} clock={clock} /> : <p>No usable times in this selection.</p>}
              {stats.timedCount < stats.count && <p>{whole.format(stats.count - stats.timedCount)} records have no usable time in this clock.</p>}
            </section>
            <div className="analytics-breakdown-stack">
              <section className="analytics-card" aria-labelledby="source-title">
                <h2 id="source-title">Observation sources</h2>
                <p>Share of detections by source.</p>
                <Breakdown rows={stats.sources} total={stats.count} />
              </section>
              <section className="analytics-card" aria-labelledby="power-title">
                <h2 id="power-title">FRP distribution</h2>
                <p>Counts by fire radiative power band. Harmonized records use their stored estimates.</p>
              {stats.frpCount ? <><Breakdown rows={stats.bands} total={stats.frpCount} /><p>Maximum {state.filters.sensor === 'Harmonized' ? 'estimated' : 'observed'} FRP: <strong>{formatPower(stats.peakFrp)}</strong></p></> : <p>No usable FRP readings in this selection.</p>}
                <a className="analytics-data-link" href="/about/">How to read the data <span aria-hidden="true">→</span></a>
              </section>
            </div>
            <section className="analytics-card analytics-strongest" aria-labelledby="strongest-title">
              <h2 id="strongest-title">Highest FRP readings</h2>
              <p>Up to eight records, ordered by fire radiative power.</p>
              {stats.strongest.length > 0 ? <div className="analytics-table-scroll" role="region" aria-label="Highest FRP readings table" tabIndex={0}>
                <table className="analytics-table">
                  <thead><tr><th scope="col">Source</th><th scope="col">Acquired (UTC)</th><th scope="col">Latitude, longitude</th><th scope="col">FRP</th></tr></thead>
                  <tbody>{stats.strongest.map(({ feature, frp, label }, index) => <tr key={index}>
                    <th scope="row">{label}</th>
                    <td>{[feature.properties.observed_at_utc?.slice(0, 10), feature.properties.acq_time_utc].filter(Boolean).join(' ') || '—'}</td>
                    <td>{feature.geometry.coordinates[1].toFixed(2)}, {feature.geometry.coordinates[0].toFixed(2)}</td>
                    <td>{formatPower(frp)}</td>
                  </tr>)}</tbody>
                </table>
              </div> : <p>No usable FRP readings in this selection.</p>}
            </section>
          </div>
      </section>
    </main>
  </div>;
}
