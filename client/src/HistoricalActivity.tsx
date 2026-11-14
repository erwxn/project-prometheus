import { ArchiveHistory } from './ArchiveHistory';
import { useMemo, useState } from 'react';
import { useDashboard } from './dashboard-context';
import { historicalTrends } from './analytics-engine';
import { metricLabel, metricUnit } from './analytics-model';
import { ActivityLineChart } from './ActivityLineChart';

const number = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });
const signed = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1, signDisplay: 'exceptZero' });
const months = Array.from({ length: 12 }, (_, i) => new Intl.DateTimeFormat('en', { month: 'short', timeZone: 'UTC' }).format(Date.UTC(2025, i, 1)));
const colors = ['#365f76', '#8b4f76', '#277569', '#9a641d', '#5151a3'];
const dashes = ['', '7 4', '2 4', '10 3 2 3', '4 2'];

export function HistoricalActivity() { const {archive}=useDashboard(); return archive.active ? <ArchiveHistory /> : <LocalHistoricalActivity />; }
function LocalHistoricalActivity() {
  const { state, index } = useDashboard();
  const { filters, collection } = state;
  const [grain, setGrain] = useState<'month' | 'year'>('month');
  const [showBaseline, setShowBaseline] = useState(true);
  const [enabledYears, setEnabledYears] = useState<string[]>([]);
  const [anomalyYear, setAnomalyYear] = useState('');
  const { startDate, endDate, sensor, metric } = filters;
  const monthly = useMemo(() => historicalTrends(index, collection.metadata, { startDate, endDate, sensor, metric }, 'month'), [index, collection.metadata, startDate, endDate, sensor, metric]);
  const yearly = useMemo(() => historicalTrends(index, collection.metadata, { startDate, endDate, sensor, metric }, 'year'), [index, collection.metadata, startDate, endDate, sensor, metric]);
  const years = useMemo(() => [...new Set(monthly.map(point => point.date.slice(0, 4)))], [monthly]);
  const yearsKey = years.join(',');
  const [previous, setPrevious] = useState<{ yearsKey: string; collection: typeof collection } | null>(null);
  if (previous?.yearsKey !== yearsKey || previous?.collection !== collection) { setPrevious({ yearsKey, collection }); setEnabledYears(years.slice(-2)); setAnomalyYear(years.at(-1) || ''); }
  const points = grain === 'month' ? monthly : yearly;
  const selectedIndex = filters.selectedDay ? points.findIndex(point => point.date === filters.selectedDay!.slice(0, grain === 'month' ? 7 : 4)) : -1;
  const series = [{ id: 'observed', label: `${filters.sensor} · recorded ${metricLabel(filters.metric).toLowerCase()}`, values: points.map(p => p.value), color: colors[0], complete: points.map(p => p.complete) }, ...(showBaseline ? [{ id: 'baseline', label: 'Previous 3 years · comparable mean', values: points.map(p => p.baseline), color: '#796b55', dash: '6 5' }] : [])];
  const comparison = years.filter(year => enabledYears.includes(year)).map((year, i) => ({ id: year, label: year, values: months.map((_, month) => monthly.find(p => p.date === `${year}-${String(month + 1).padStart(2, '0')}`)?.value ?? null), color: colors[i % colors.length], dash: dashes[i % dashes.length], complete: months.map((_, month) => monthly.find(p => p.date === `${year}-${String(month + 1).padStart(2, '0')}`)?.complete ?? false) }));
  const anomalyPoints = grain === 'year' ? points : points.filter(p => p.date.startsWith(anomalyYear));
  const unit = metricUnit(filters.metric);

  return <section className="dashboard-section historical-activity" aria-labelledby="history-title">
    <div className="section-toolbar"><div><span className="section-number">02 / HISTORICAL CONTEXT</span><h2 id="history-title">Historical fire comparison</h2><p>Compare recorded activity within the selected sensor, region, and UTC date range.</p></div>
      <div className="inline-controls"><label>Trend grouping<select value={grain} onChange={e => setGrain(e.target.value as typeof grain)}><option value="month">Monthly</option><option value="year">Yearly</option></select></label><label className="checkbox-control"><input type="checkbox" checked={showBaseline} onChange={e => setShowBaseline(e.target.checked)} />Show historical baseline</label></div>
    </div>
    {filters.sensor === 'ALL' ? <p className="dashboard-unavailable">Select MODIS, VIIRS, or a supported harmonized method. Raw counts from different sensors are not equivalent measures of fire activity.</p> : !points.length ? <p className="dashboard-unavailable">No dated history is available. Load a dated CSV or choose simulated history to explore comparisons.</p> : <>
      <ActivityLineChart title="Historical activity trend" labels={points.map(point => point.date)} series={series} unit={unit} selectedIndex={selectedIndex} />
      <p className="scientific-note">Hollow points and * indicate partial periods or unknown coverage. Values are recorded observations, not coverage-corrected activity. Calendar focus highlights a period and keeps this historical range.</p>
      <div className="history-comparison-heading"><h3>Year-over-year activity</h3><fieldset className="year-toggles"><legend>Show years</legend>{years.map(year => <label key={year}><input type="checkbox" checked={enabledYears.includes(year)} onChange={e => setEnabledYears(previous => e.target.checked ? [...previous, year] : previous.filter(value => value !== year))} />{year}</label>)}</fieldset></div>
      <ActivityLineChart title="Year-over-year monthly comparison" labels={months} series={comparison} unit={unit} selectedIndex={filters.selectedDay ? Number(filters.selectedDay.slice(5, 7)) - 1 : -1} />
      <div className="section-toolbar anomaly-heading"><div><h3>Historical anomalies</h3><p>Observed − historical mean. Percentage change uses the historical mean as denominator.</p></div>{grain === 'month' && <label>Anomaly year<select value={anomalyYear} onChange={e => setAnomalyYear(e.target.value)}>{years.map(year => <option key={year}>{year}</option>)}</select></label>}</div>
      {!points.some(p => p.baseline !== null) && <p className="dashboard-unavailable">Historical baseline unavailable. Three preceding complete years with the same sensor and product/method are required. A hotspot CSV alone does not establish coverage or comparability.</p>}
      <div className="analytics-table-scroll anomaly-table" tabIndex={0} role="region" aria-label="Historical anomalies"><table className="analytics-table"><caption>{filters.sensor} · {metricLabel(filters.metric)} · {collection.metadata.source === 'simulated' ? 'Simulated examples' : 'Loaded observations'}</caption><thead><tr><th scope="col">Period</th><th scope="col">Observed ({unit})</th><th scope="col">Baseline ({unit})</th><th scope="col">Absolute anomaly</th><th scope="col">Percentage</th><th scope="col">Reference / availability</th></tr></thead><tbody>{anomalyPoints.map(p => <tr key={p.date} className={selectedIndex >= 0 && points[selectedIndex]?.date === p.date ? 'selected-period' : undefined}><th scope="row">{p.date}</th><td>{p.value === null ? '—' : `${number.format(p.value)}${!p.complete ? ' *' : ''}`}</td><td>{p.baseline === null ? '—' : number.format(p.baseline)}</td><td>{p.absoluteAnomaly === null ? 'Unavailable' : `${signed.format(p.absoluteAnomaly)} ${unit}`}</td><td>{p.percentageAnomaly === null ? p.baseline === 0 ? 'Undefined · zero baseline' : 'Unavailable' : `${signed.format(p.percentageAnomaly)}%`}</td><td>{p.baselineReason}</td></tr>)}</tbody></table></div>
      <p className="scientific-note">Each baseline averages the matching month or year in the immediately preceding three calendar years. Reference years can fall outside the displayed range. Missing coverage, changed methods, and missing metrics suppress anomalies; zero baselines never produce an infinite percentage.</p>
    </>}
  </section>;
}
