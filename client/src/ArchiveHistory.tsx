import { useMemo } from 'react';
import { ActivityLineChart, type ChartSeries } from './ActivityLineChart';
import { useDashboard } from './dashboard-context';
import { metricLabel, metricUnit } from './analytics-model';
import type { ArchiveBucket, ArchiveSummary } from './archive-model';
import { alignedKeys, chartTitle, historicalLabel, historicalValue, periodKeys, valuesForYear, type TrendGrouping } from './historical-chart';

const colors = ['#365f76', '#8b4f76', '#277569', '#9a641d', '#5151a3', '#9c3b3b', '#4b6f2a', '#6d4c9a', '#ad6a00', '#227b82'].map((color, index) => `var(--chart-${index + 1}, ${color})`);
const dashes = ['', '7 4', '2 4', '10 3 2 3', '4 2'];
const buckets = (summary: ArchiveSummary | null, grouping: TrendGrouping): ArchiveBucket[] => summary?.[grouping] ?? [];

export function ArchiveHistory() {
  const { archive, state } = useDashboard();
  const grouping = archive.trendGrouping;
  const metric = state.filters.metric;
  const unit = metricUnit(metric);
  const years = useMemo(() => [...new Set((archive.catalog?.partitions ?? [])
    .filter(partition => archive.platform === 'ALL' || partition.platform === archive.platform)
    .map(partition => Number(partition.month.slice(0, 4))))].sort((a, b) => b - a), [archive.catalog, archive.platform]);
  const selectedYears = useMemo(() => [...archive.comparisonYears].sort((a, b) => a - b), [archive.comparisonYears]);
  const comparing = archive.platform !== 'ALL' && selectedYears.length > 0 && archive.comparison !== null;
  const source = comparing ? archive.comparison : archive.data;
  const grouped = buckets(source, grouping);
  const methods = useMemo(() => new Set(archive.comparison?.daily.flatMap(day => day.methods) ?? []), [archive.comparison]);
  const knownMethods = [...methods].filter(method => !method.endsWith('/unknown'));
  const comparableProduct = methods.size === 1 && knownMethods.length === 1;

  let keys: string[];
  let labels: string[];
  let series: ChartSeries[];
  let selectedIndex = -1;
  let xAxisLabel: string;

  if (grouping === 'yearly' && comparing) {
    keys = selectedYears.map(String);
    labels = keys;
    const lookup = new Map(grouped.map(bucket => [bucket.date, bucket]));
    series = selectedYears.map((year, index) => ({ id: String(year), label: `${year} · recorded annual observations`, color: colors[index % colors.length], dash: dashes[index % dashes.length], values: keys.map(key => key === String(year) ? historicalValue(lookup.get(key), metric) : null), complete: keys.map(() => false) }));
    selectedIndex = state.filters.selectedDay ? keys.indexOf(state.filters.selectedDay.slice(0, 4)) : -1;
    xAxisLabel = 'UTC year';
  } else if (grouping !== 'yearly' && comparing) {
    keys = alignedKeys(state.filters.startDate, state.filters.endDate, grouping);
    labels = keys.map(key => historicalLabel(key, grouping, true));
    series = selectedYears.map((year, index) => ({ id: String(year), label: `${year} · recorded observations`, color: colors[index % colors.length], dash: dashes[index % dashes.length], values: valuesForYear(grouped, year, keys, metric), complete: keys.map(() => false) }));
    const focus = grouping === 'daily' ? state.filters.selectedDay?.slice(5) : state.filters.selectedDay?.slice(5, 7);
    selectedIndex = focus ? keys.indexOf(focus) : -1;
    xAxisLabel = grouping === 'daily' ? 'UTC month and day' : 'UTC month';
  } else {
    keys = periodKeys(state.filters.startDate, state.filters.endDate, grouping);
    labels = keys.map(key => historicalLabel(key, grouping));
    const lookup = new Map(grouped.map(bucket => [bucket.date, bucket]));
    series = [{ id: 'selected-period', label: `${archive.platform} · recorded ${metricLabel(metric).toLowerCase()}`, color: colors[0], values: keys.map(key => historicalValue(lookup.get(key), metric)), complete: keys.map(() => false) }];
    const focus = state.filters.selectedDay?.slice(0, grouping === 'daily' ? 10 : grouping === 'monthly' ? 7 : 4);
    selectedIndex = focus ? keys.indexOf(focus) : -1;
    xAxisLabel = grouping === 'daily' ? 'UTC date' : grouping === 'monthly' ? 'UTC month' : 'UTC year';
  }

  const comparisonDetail = methods.size === 0
    ? 'No processing-version evidence is available for the selected observations.'
    : methods.size > 1
      ? `Processing versions in the selected observations: ${[...methods].join(', ')}.`
      : knownMethods.length === 0
        ? `The selected observations report an unknown processing version (${[...methods].join(', ')}).`
        : '';

  return <section className="dashboard-section historical-activity" aria-labelledby="history-title" aria-busy={archive.busy}>
    <div className="section-toolbar"><div><span className="section-number">02 / HISTORICAL CONTEXT</span><h2 id="history-title">Historical fire comparison</h2><p>Recorded raw observations for {archive.platform}, within the selected geographic area and UTC period. Missing dates remain gaps.</p></div>
      <label>Trend grouping<select value={grouping} onChange={event => archive.setTrendGrouping(event.target.value as TrendGrouping)}><option value="monthly">Monthly</option><option value="yearly">Yearly</option></select></label>
    </div>
    {archive.platform !== 'ALL' && <fieldset className="year-toggles"><legend>Compare available years (up to 10)</legend>{years.map(year => <label key={year}><input type="checkbox" checked={archive.comparisonYears.includes(year)} disabled={!archive.comparisonYears.includes(year) && archive.comparisonYears.length >= 10} onChange={event => archive.setComparisonYears(previous => event.target.checked ? [...previous, year].sort((a, b) => a - b) : previous.filter(value => value !== year))} />{year}</label>)}</fieldset>}
    {archive.busy ? <p role="status" className="dashboard-loading">Loading full-selection historical aggregates…</p> : <ActivityLineChart title={chartTitle(grouping, metric)} labels={labels} series={series} unit={unit} selectedIndex={selectedIndex} xAxisLabel={xAxisLabel} pointSpacing={grouping === 'monthly' ? 58 : 130} display={grouping === 'yearly' ? 'bar' : 'line'} />}
    {comparing && <p className="scientific-note">Selected years are aligned by {grouping === 'daily' ? 'calendar month/day' : grouping === 'monthly' ? 'calendar month' : 'year'}. These are descriptive recorded observations; hollow points indicate incomplete or unknown coverage.</p>}
    {archive.platform === 'ALL' ? <p className="dashboard-unavailable">Choose one satellite/product for historical comparisons. MODIS and VIIRS raw counts are descriptive only and are not directly comparable.</p> : comparisonDetail && <div className="dashboard-unavailable comparison-limitation"><p><strong>Historical comparison is limited.</strong> The selected observations come from different processing versions, and their comparability has not yet been verified. You can explore the recorded detections, but validated fire-activity anomalies are unavailable.</p><details><summary>Why?</summary><p>{comparisonDetail}</p></details></div>}
    {comparing && comparableProduct && <p className="scientific-note">The selected series share product/version evidence ({knownMethods[0]}), but the archive still does not establish complete satellite coverage.</p>}
    <h3>Historical baseline and anomalies</h3><p className="dashboard-unavailable">{archive.data?.baselineReason || 'Satellite coverage is not established by this archive; baseline and anomalies are unavailable.'}</p>
    <div className="analytics-table-scroll anomaly-table" tabIndex={0} role="region" aria-label={`${chartTitle(grouping, metric)} exact values`}><table className="analytics-table"><caption>Exact {grouping} observations · incomplete or unknown coverage</caption><thead><tr><th scope="col">Period</th><th scope="col">Detections</th><th scope="col">Mean FRP (MW)</th><th scope="col">Coverage / anomaly</th></tr></thead><tbody>{grouped.map(bucket => <tr key={bucket.date}><th scope="row">{bucket.date}</th><td>{bucket.count.toLocaleString()}</td><td>{bucket.frpCount ? (bucket.frpSum / bucket.frpCount).toFixed(3) : 'Unavailable'}</td><td>Incomplete or unknown · anomaly unavailable</td></tr>)}</tbody></table></div>
    <p className="scientific-note">Days without indexed records remain unknown, not zero. FRP means use valid readings only. February 29 is an explicit gap for non-leap years. Original NASA observations are unchanged.</p>
  </section>;
}
