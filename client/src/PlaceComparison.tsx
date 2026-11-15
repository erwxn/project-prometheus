import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ActivityLineChart } from './ActivityLineChart';
import { dateRangeError, enumerateDates } from './analytics-engine';
import { metricLabel, metricUnit, type SensorFilter } from './analytics-model';
import { readArchiveResponse } from './archive-api';
import type { ArchiveSummary } from './archive-model';
import { countryBoundaries, countryName } from './country-filter';
import { useDashboard } from './dashboard-context';
import { API_BASE } from './fire-data';
import { boundaryAreaKm2, compareMonths, snapshotComparison } from './place-comparison';

const countries = Object.entries(countryBoundaries).sort(([, a], [, b]) => a.properties.name.localeCompare(b.properties.name));
const number = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });
const densityNumber = new Intl.NumberFormat(undefined, { maximumSignificantDigits: 4 });
type PlaceResult = ReturnType<typeof compareMonths> & { code: string; area: number };
type Comparison = { places: PlaceResult[]; start: string; end: string; days: number; source: string };

export function PlaceComparison() {
  const { archive, state, prepared } = useDashboard();
  const { country, startDate, endDate, sensor } = state.filters;
  const source = archive.active ? `Raw FIRMS archive · ${archive.platform}` : `${state.collection.metadata.source_name || state.collection.metadata.source} · ${sensor}${state.filters.simulatedPlatform ? ` · ${state.filters.simulatedPlatform}` : ''}`;
  const selectionKey = archive.active ? `archive:${archive.platform}` : source;
  return <ComparisonPanel key={selectionKey} {...{ archive, state, prepared, country, startDate, endDate, sensor, source }} />;
}

function ComparisonPanel({ archive, state, prepared, country, startDate, endDate, sensor, source }: Pick<ReturnType<typeof useDashboard>, 'archive' | 'state' | 'prepared'> & {
  country: string | null | undefined; startDate: string; endDate: string; sensor: SensorFilter; source: string;
}) {
  const [first, setFirst] = useState(country && countryBoundaries[country] ? country : 'MAR');
  const [second, setSecond] = useState(first === 'ESP' ? 'MAR' : 'ESP');
  const [start, setStart] = useState<string | null>(null);
  const [end, setEnd] = useState<string | null>(null);
  const [density, setDensity] = useState(false);
  const [month, setMonth] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [comparison, setComparison] = useState<(Comparison & { snapshot: typeof state.collection | null }) | null>(null);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  const from = start ?? startDate, to = end ?? endDate;
  const shown = comparison && (archive.active || comparison.snapshot === state.collection) ? comparison : null;
  const singleSource = archive.active ? archive.platform !== 'ALL' : sensor !== 'ALL';

  async function run(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current || !singleSource) return;
    const invalid = dateRangeError(from, to);
    if (!from || !to || invalid || first === second) {
      setError(invalid || (first === second ? 'Choose two different countries.' : 'Enter a date range.'));
      return;
    }
    const dates = enumerateDates(from, to);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort('timeout'), 30_000);
    pending.current = controller;
    setBusy(true);
    setError('');
    try {
      const codes = [first, second];
      let results;
      if (archive.active) {
        const summaries = await Promise.all(codes.map(async country => {
          const response = await fetch(`${API_BASE}/api/v1/fires/archive/summary`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
            body: JSON.stringify({ platform: archive.platform, startDate: from, endDate: to, country }),
          });
          return readArchiveResponse<ArchiveSummary>(response);
        }));
        if (summaries[0].metadata?.version !== summaries[1].metadata?.version) throw new Error('The archive changed during the comparison. Run it again.');
        results = summaries.map(summary => compareMonths(dates, new Map(summary.daily.map(day => [day.date, day.count])), new Set()));
      } else {
        results = codes.map(code => snapshotComparison(dates, prepared, state.collection.metadata, sensor, code, state.filters.simulatedPlatform));
      }
      if (!controller.signal.aborted) {
        setMonth('');
        setComparison({ start: from, end: to, days: dates.length, source, snapshot: archive.active ? null : state.collection, places: results.map((result, i) => ({ ...result, code: codes[i], area: boundaryAreaKm2(countryBoundaries[codes[i]].geometry) })) });
      }
    } catch (failure) {
      if (controller.signal.reason === 'timeout') setError('The comparison timed out. Try a shorter date range.');
      else if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'Could not compare these countries.');
    } finally {
      window.clearTimeout(timeout);
      pending.current = null;
      if (!controller.signal.aborted || controller.signal.reason === 'timeout') setBusy(false);
      controller.abort();
    }
  }

  const labels = shown ? [...shown.places[0].months.keys()] : [];
  const recordUnit = archive.active ? undefined : state.collection.metadata.record_unit;
  const countUnit = metricUnit('detections', recordUnit);
  const countLabel = metricLabel('detections', recordUnit);
  const unit = density ? `${countUnit} per 1,000 km²` : countUnit;
  const scaled = (count: number, area: number) => density ? area > 0 ? count * 1_000 / area : null : count;

  return <section className="dashboard-section place-comparison" aria-labelledby="places-title">
    <div className="section-toolbar"><div><h2 id="places-title">Compare places</h2><p>Compare monthly {countLabel.toLowerCase()} for two countries over the same UTC dates.</p></div></div>
    <form className="inline-controls place-comparison-form" onSubmit={run}>
      <label>First country<select value={first} onChange={event => setFirst(event.target.value)}>{countries.map(([code, feature]) => <option key={code} value={code}>{feature.properties.name}</option>)}</select></label>
      <label>Second country<select value={second} onChange={event => setSecond(event.target.value)}>{countries.map(([code, feature]) => <option key={code} value={code}>{feature.properties.name}</option>)}</select></label>
      <label>From (UTC)<input type="date" required value={from} onChange={event => setStart(event.target.value)} /></label>
      <label>To (UTC)<input type="date" required value={to} onChange={event => setEnd(event.target.value)} /></label>
      <button type="submit" disabled={busy || !singleSource || state.status === 'loading'}>{busy ? 'Comparing…' : 'Compare countries'}</button>
    </form>
    <p className="scientific-note">Source for both countries: {source}.{!singleSource && ' Choose one satellite platform or sensor in Filters to compare.'}</p>
    {error && <p className="dashboard-error" role="alert">{error}</p>}
    {shown && <div className="place-comparison-results" aria-busy={busy}>
      <div className="section-toolbar"><div><h3>{shown.places.map(place => countryName(place.code)).join(' and ')}</h3><p>{shown.start} to {shown.end} UTC · {shown.source}</p></div><label>Chart metric<select value={density ? 'density' : 'count'} onChange={event => setDensity(event.target.value === 'density')}><option value="count">Total {countLabel.toLowerCase()}</option><option value="density">{countLabel} per 1,000 km²</option></select></label></div>
      <dl className="analytics-metrics place-comparison-metrics" aria-label="Country comparison totals">
        {shown.places.map(place => {
          const counts = [...place.months.values()].flatMap(month => month.count === null ? [] : [month.count]);
          const total = counts.length ? scaled(counts.reduce((sum, count) => sum + count, 0), place.area) : null;
          return <div key={place.code}><dt>{countryName(place.code)}</dt><dd>{total === null ? '—' : (density ? densityNumber : number).format(total)}<small>{unit} · {place.covered ? `${place.covered} of ${shown.days} days with confirmed coverage` : 'Coverage unverified'}</small></dd></div>;
        })}
      </dl>
      <ActivityLineChart key={`${shown.places.map(p => p.code).join('-')}:${shown.start}:${shown.end}:${unit}`} title="Monthly activity comparison" labels={labels} unit={unit} xAxisLabel="UTC month" series={shown.places.map((place, index) => ({
        id: place.code, label: countryName(place.code), color: index === 0 ? 'var(--chart-1, #365f76)' : 'var(--chart-4, #9a641d)', dash: index === 1 ? '6 4' : undefined,
        values: labels.map(label => { const count = place.months.get(label)?.count; return count == null ? null : scaled(count, place.area); }),
        complete: labels.map(label => place.months.get(label)?.complete === true),
      }))} selectedIndex={labels.indexOf(month)} onPointInspect={index => setMonth(labels[index])} />
      <div className="inline-controls place-month-inspector">
        <label>Inspect month<select value={month} onChange={event => setMonth(event.target.value)}><option value="">Choose a month</option>{labels.map(label => <option key={label}>{label}</option>)}</select></label>
        {month && <ul aria-label={`Activity in ${month}`}>
          {shown.places.map(place => {
            const entry = place.months.get(month);
            const value = entry?.count == null ? null : scaled(entry.count, place.area);
            return <li key={place.code}><strong>{countryName(place.code)}</strong> {value === null ? 'Unavailable' : `${(density ? densityNumber : number).format(value)} ${unit}`} · {entry?.complete ? 'Coverage confirmed' : 'Coverage incomplete or unknown'}</li>;
          })}
        </ul>}
      </div>
      <p className="scientific-note">Gaps indicate unavailable activity. Hollow points and * show recorded counts with incomplete or unknown coverage. Partial months use only the selected dates. Density uses the same map polygons as the country filter.</p>
    </div>}
  </section>;
}
