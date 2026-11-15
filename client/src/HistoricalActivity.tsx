import { useMemo, useState } from 'react';
import { ArchiveHistory } from './ArchiveHistory';
import { ActivityLineChart, type ChartSeries } from './ActivityLineChart';
import { useDashboard } from './dashboard-context';
import { activityDay, enumerateDates, historicalTrends } from './analytics-engine';
import { metricLabel, metricUnit, type TrendPoint } from './analytics-model';
import { alignedKeys, chartTitle, historicalLabel, periodKeys, type TrendGrouping } from './historical-chart';

const number = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });
const signed = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1, signDisplay: 'exceptZero' });
const colors = ['#365f76', '#8b4f76', '#277569', '#9a641d', '#5151a3'].map((color, index) => `var(--chart-${index + 1}, ${color})`);
const dashes = ['', '7 4', '2 4', '10 3 2 3', '4 2'];

export function HistoricalActivity() {
  const { archive } = useDashboard();
  return archive.active ? <ArchiveHistory /> : <LocalHistoricalActivity />;
}

function LocalHistoricalActivity() {
  const { state, index } = useDashboard();
  const { filters, collection } = state;
  const [grouping, setGrouping] = useState<TrendGrouping>('monthly');
  const [showBaseline, setShowBaseline] = useState(true);
  const [yearChoice, setYearChoice] = useState<{ key: string; values: string[] } | null>(null);
  const [anomalyChoice, setAnomalyChoice] = useState<{ key: string; value: string } | null>(null);
  const { startDate, endDate, sensor, metric } = filters;
  const monthly = useMemo(() => historicalTrends(index, collection.metadata, { startDate, endDate, sensor, metric }, 'month'), [index, collection.metadata, startDate, endDate, sensor, metric]);
  const yearly = useMemo(() => historicalTrends(index, collection.metadata, { startDate, endDate, sensor, metric }, 'year'), [index, collection.metadata, startDate, endDate, sensor, metric]);
  const daily = useMemo<TrendPoint[]>(() => enumerateDates(startDate, endDate).map(date => {
    const day = activityDay(date, index, collection.metadata, sensor, metric);
    return { date, count: day.count, value: day.value, complete: day.availability === 'complete', baseline: null, absoluteAnomaly: null, percentageAnomaly: null, baselineReason: 'Daily baselines are not calculated; use monthly or yearly grouping.' };
  }), [startDate, endDate, index, collection.metadata, sensor, metric]);
  const points = grouping === 'daily' ? daily : grouping === 'monthly' ? monthly : yearly;
  const years = useMemo(() => [...new Set(daily.filter(point => point.value !== null).map(point => point.date.slice(0, 4)))], [daily]);
  const yearsKey = years.join(',');

  const enabledYears = yearChoice?.key === yearsKey ? yearChoice.values : years.slice(-2);
  const anomalyYear = anomalyChoice?.key === yearsKey ? anomalyChoice.value : years.at(-1) || '';
  const selectedYears = years.filter(year => enabledYears.includes(year));
  const comparing = selectedYears.length > 0;
  let keys: string[];
  let labels: string[];
  let series: ChartSeries[];
  let selectedIndex = -1;
  let xAxisLabel: string;

  if (grouping === 'daily' && comparing) {
    keys = alignedKeys(startDate, endDate, 'daily');
    labels = keys.map(key => historicalLabel(key, 'daily', true));
    series = selectedYears.map((year, i) => {
      const days = keys.map(key => activityDay(`${year}-${key}`, index, collection.metadata, sensor, metric));
      return { id: year, label: year, values: days.map(day => day.value), complete: days.map(day => day.availability === 'complete'), color: colors[i % colors.length], dash: dashes[i % dashes.length] };
    });
    selectedIndex = filters.selectedDay ? keys.indexOf(filters.selectedDay.slice(5)) : -1;
    xAxisLabel = 'UTC month and day';
  } else if (grouping === 'monthly' && comparing) {
    keys = alignedKeys(startDate, endDate, 'monthly');
    labels = keys.map(key => historicalLabel(key, 'monthly', true));
    const byYear = selectedYears.map(year => historicalTrends(index, collection.metadata, { startDate: `${year}-01-01`, endDate: `${year}-12-31`, sensor, metric }, 'month'));
    series = selectedYears.map((year, i) => ({ id: year, label: year, values: keys.map(key => byYear[i].find(point => point.date === `${year}-${key}`)?.value ?? null), complete: keys.map(key => byYear[i].find(point => point.date === `${year}-${key}`)?.complete ?? false), color: colors[i % colors.length], dash: dashes[i % dashes.length] }));
    if (showBaseline && selectedYears.length) {
      const latest = byYear.at(-1)!;
      series.push({ id: 'baseline', label: `${selectedYears.at(-1)} · preceding 3-year comparable mean`, values: keys.map(key => latest.find(point => point.date === `${selectedYears.at(-1)}-${key}`)?.baseline ?? null), color: 'var(--chart-baseline, #796b55)', dash: '6 5' });
    }
    selectedIndex = filters.selectedDay ? keys.indexOf(filters.selectedDay.slice(5, 7)) : -1;
    xAxisLabel = 'UTC month';
  } else if (grouping === 'yearly' && comparing) {
    keys = selectedYears;
    labels = keys;
    const lookup = new Map(yearly.map(point => [point.date, point]));
    series = selectedYears.map((year, i) => ({ id: year, label: `${year} · recorded observations`, values: keys.map(key => key === year ? lookup.get(year)?.value ?? null : null), complete: keys.map(key => key === year && (lookup.get(year)?.complete ?? false)), color: colors[i % colors.length], dash: dashes[i % dashes.length] }));
    if (showBaseline) series.push({ id: 'baseline', label: 'Preceding 3-year comparable mean', values: keys.map(key => lookup.get(key)?.baseline ?? null), color: 'var(--chart-baseline, #796b55)', dash: '6 5' });
    selectedIndex = filters.selectedDay ? keys.indexOf(filters.selectedDay.slice(0, 4)) : -1;
    xAxisLabel = 'UTC year';
  } else {
    keys = periodKeys(startDate, endDate, grouping);
    labels = keys.map(key => historicalLabel(key, grouping));
    const lookup = new Map(points.map(point => [point.date, point]));
    series = [{ id: 'observed', label: `${sensor} · recorded ${metricLabel(metric).toLowerCase()}`, values: keys.map(key => lookup.get(key)?.value ?? null), complete: keys.map(key => lookup.get(key)?.complete ?? false), color: colors[0] }];
    if (showBaseline && grouping !== 'daily') series.push({ id: 'baseline', label: 'Previous 3 years · comparable mean', values: keys.map(key => lookup.get(key)?.baseline ?? null), color: 'var(--chart-baseline, #796b55)', dash: '6 5' });
    const focus = filters.selectedDay?.slice(0, grouping === 'daily' ? 10 : grouping === 'monthly' ? 7 : 4);
    selectedIndex = focus ? keys.indexOf(focus) : -1;
    xAxisLabel = grouping === 'daily' ? 'UTC date' : grouping === 'monthly' ? 'UTC month' : 'UTC year';
  }

  const anomalyPoints = grouping === 'yearly' ? yearly : grouping === 'monthly' ? monthly.filter(point => point.date.startsWith(anomalyYear)) : daily.filter(point => point.date.startsWith(anomalyYear));
  const unit = metricUnit(metric);
  return <section className="dashboard-section historical-activity" aria-labelledby="history-title">
    <div className="section-toolbar"><div><span className="section-number">02 / HISTORICAL CONTEXT</span><h2 id="history-title">Historical fire comparison</h2><p>Compare recorded activity within the selected sensor, region, and UTC date range.</p></div>
      <div className="inline-controls"><label>Trend grouping<select value={grouping} onChange={event => setGrouping(event.target.value as TrendGrouping)}><option value="monthly">Monthly</option><option value="yearly">Yearly</option></select></label><label className="checkbox-control"><input type="checkbox" checked={showBaseline} onChange={event => setShowBaseline(event.target.checked)} />Show historical baseline</label></div>
    </div>
    {sensor === 'ALL' ? <p className="dashboard-unavailable">Select MODIS, VIIRS, or a supported harmonized method. Raw counts from different sensors are not equivalent measures of fire activity.</p> : !points.some(point => point.value !== null) ? <p className="dashboard-unavailable">No dated observations match the selected sensor, area, and UTC range.</p> : <>
      <fieldset className="year-toggles"><legend>Show years</legend>{years.map(year => <label key={year}><input type="checkbox" checked={enabledYears.includes(year)} onChange={event => setYearChoice({ key: yearsKey, values: event.target.checked ? [...enabledYears, year] : enabledYears.filter(value => value !== year) })} />{year}</label>)}</fieldset>
      <ActivityLineChart title={chartTitle(grouping, metric)} labels={labels} series={series} unit={unit} selectedIndex={selectedIndex} xAxisLabel={xAxisLabel} pointSpacing={grouping === 'monthly' ? 58 : 130} display={grouping === 'yearly' ? 'bar' : 'line'} />
      <p className="scientific-note">Missing dates remain gaps. Hollow points and * indicate partial periods or unknown coverage. Values are recorded observations, not coverage-corrected activity.</p>
      <div className="section-toolbar anomaly-heading"><div><h3>Historical anomalies</h3><p>Observed − historical mean. Percentage change uses the historical mean as denominator.</p></div>{grouping !== 'yearly' && <label>Anomaly year<select value={anomalyYear} onChange={event => setAnomalyChoice({ key: yearsKey, value: event.target.value })}>{years.map(year => <option key={year}>{year}</option>)}</select></label>}</div>
      {grouping === 'daily' ? <p className="dashboard-unavailable">Validated daily anomalies are not calculated. Choose Monthly or Yearly for the preceding-three-complete-years baseline rule.</p> : !points.some(point => point.baseline !== null) && <p className="dashboard-unavailable">Historical baseline unavailable. Three preceding complete years with the same sensor and product/method are required. A hotspot CSV alone does not establish coverage or comparability.</p>}
      <div className="analytics-table-scroll anomaly-table" tabIndex={0} role="region" aria-label="Historical anomalies"><table className="analytics-table"><caption>{sensor} · {metricLabel(metric)} · {collection.metadata.source === 'simulated' ? 'Simulated examples' : 'Loaded observations'}</caption><thead><tr><th scope="col">Period</th><th scope="col">Observed ({unit})</th><th scope="col">Baseline ({unit})</th><th scope="col">Absolute anomaly</th><th scope="col">Percentage</th><th scope="col">Reference / availability</th></tr></thead><tbody>{anomalyPoints.map(point => <tr key={point.date}><th scope="row">{point.date}</th><td>{point.value === null ? '—' : `${number.format(point.value)}${!point.complete ? ' *' : ''}`}</td><td>{point.baseline === null ? '—' : number.format(point.baseline)}</td><td>{point.absoluteAnomaly === null ? 'Unavailable' : `${signed.format(point.absoluteAnomaly)} ${unit}`}</td><td>{point.percentageAnomaly === null ? point.baseline === 0 ? 'Undefined · zero baseline' : 'Unavailable' : `${signed.format(point.percentageAnomaly)}%`}</td><td>{point.baselineReason}</td></tr>)}</tbody></table></div>
      <p className="scientific-note">Monthly and yearly baselines use the matching period in the immediately preceding three complete comparable years. Missing coverage, changed methods, and missing metrics suppress anomalies; zero baselines never produce an infinite percentage.</p>
    </>}
  </section>;
}
