import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { SiteBrand, SiteNavigation } from './SiteHeader';
import { API_BASE, FALLBACK_FIRES, type FireFeature } from './fire-data';
import { sensors, summarizeObservations } from './fire-analytics';
import type { TimeBasis } from './timeline';
import './index.css';
import './analytics.css';
import './editorial.css';

const whole = new Intl.NumberFormat();
const decimal = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });
const hourLabel = (hour: number) => `${String(hour).padStart(2, '0')}:00`;
const formatPower = (value: number | null) => value === null ? '—' : `${decimal.format(value)} MW`;

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

function AnalyticsPage() {
  const [dataset, setDataset] = useState<{ features: FireFeature[]; label: string; status: 'loading' | 'ready' | 'offline' }>({ features: [], label: '', status: 'loading' });
  const [source, setSource] = useState('ALL');
  const [date, setDate] = useState('');
  const [basis, setBasis] = useState<TimeBasis>('utc');

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const timeout = window.setTimeout(() => controller.abort(), 10000);

    async function load() {
      try {
        const response = await fetch(`${API_BASE}/api/v1/fires`, { signal: controller.signal, cache: 'no-store' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (!Array.isArray(data.features)) throw new Error('Invalid observation collection');
        if (active) setDataset({ features: data.features, label: data.metadata?.source === 'csv' ? 'Imported MODIS snapshot' : 'Illustrative demo dataset', status: 'ready' });
      } catch {
        if (active) setDataset({ features: FALLBACK_FIRES, label: 'Offline demo dataset', status: 'offline' });
      } finally {
        window.clearTimeout(timeout);
      }
    }

    void load();
    return () => { active = false; controller.abort(); window.clearTimeout(timeout); };
  }, []);

  const dates = useMemo(() => [...new Set(dataset.features.flatMap(feature => {
    const value = feature.properties.observed_at_utc?.slice(0, 10);
    return value ? [value] : [];
  }))].sort().reverse(), [dataset.features]);
  const stats = useMemo(() => summarizeObservations(dataset.features, source, date, basis), [dataset.features, source, date, basis]);
  const clock = basis === 'utc' ? 'UTC' : 'local solar time';
  const [firstPeak] = stats.peakHours;
  const busiest = stats.peakHours.length > 1 ? `${stats.peakHours.length} hours tied` : firstPeak !== undefined ? hourLabel(firstPeak) : '—';

  return (
    <div className="mission-app analytics-page">
      <header className="mission-header">
        <SiteBrand />
        <SiteNavigation current="analytics" />
        <div className="challenge-tag"><span className="tiny-orbit" aria-hidden="true" />NASA Space Apps</div>
      </header>

      <main className="analytics-content">
        <section className="analytics-hero" aria-labelledby="analytics-title">
          <span className="analytics-orbit" aria-hidden="true" />
          <h1 id="analytics-title">Fire analytics</h1>
          <p>Explore when satellite detections occur, which sources recorded them, and how much radiant power they report.</p>
        </section>

        <section className="analytics-filters" aria-label="Dashboard filters">
          <div className="analytics-provenance">
            <strong role="status">{dataset.status === 'loading' ? 'Loading observations…' : dataset.label}</strong>
            <span>{dataset.status === 'offline' ? 'The server is unavailable. Showing bundled examples.' : 'Uses the server dataset. Temporary explorer uploads stay in the explorer.'}</span>
          </div>
          <div className="analytics-filter"><label htmlFor="analytics-source">Source</label><select id="analytics-source" value={source} onChange={event => setSource(event.target.value)}>
            <option value="ALL">All sources</option>
            {sensors.map(sensor => <option key={sensor.id} value={sensor.id}>{sensor.label}</option>)}
          </select></div>
          {dates.length > 0 && <div className="analytics-filter"><label htmlFor="analytics-date">Acquisition date (UTC)</label><select id="analytics-date" value={date} onChange={event => setDate(event.target.value)}>
            <option value="">All dates</option>
            {dates.map(value => <option key={value} value={value}>{value}</option>)}
          </select></div>}
          <div className="analytics-filter"><label htmlFor="analytics-clock">Hourly chart clock</label><select id="analytics-clock" value={basis} onChange={event => setBasis(event.target.value === 'solar' ? 'solar' : 'utc')}>
            <option value="utc">UTC</option><option value="solar">Local solar time</option>
          </select></div>
        </section>

        {dataset.status !== 'loading' && (stats.count === 0 ? <p className="analytics-empty" role="status">No detections match these filters. Choose another source or date.</p> : <>
          <dl className="analytics-metrics" aria-label="Observation summary">
            <div><dt>Detections</dt><dd>{whole.format(stats.count)}<small>Records matching the filters</small></dd></div>
            <div><dt>Mean FRP</dt><dd>{formatPower(stats.meanFrp)}<small>{whole.format(stats.frpCount)} records with FRP</small></dd></div>
            <div><dt>Peak FRP</dt><dd>{formatPower(stats.peakFrp)}<small>Highest reported value</small></dd></div>
            <div><dt>Busiest hour</dt><dd>{busiest}<small>{stats.peakHourCount ? `${whole.format(stats.peakHourCount)} detections per peak hour · ${clock}` : 'No timed records'}</small></dd></div>
          </dl>

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
                {stats.frpCount ? <Breakdown rows={stats.bands} total={stats.frpCount} /> : <p>No usable FRP readings in this selection.</p>}
                <a className="analytics-data-link" href="/about/">How to read the data <span aria-hidden="true">→</span></a>
              </section>
            </div>
            <section className="analytics-card analytics-strongest" aria-labelledby="strongest-title">
              <h2 id="strongest-title" className="space-heading space-heading-starburst">Highest FRP readings</h2>
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
        </>)}
      </main>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<AnalyticsPage />);
