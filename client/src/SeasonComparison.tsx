import { useEffect, useMemo, useRef } from 'react';
import { historicalTrends } from './analytics-engine';
import { metricUnit } from './analytics-model';
import { countryName } from './country-filter';
import { useDashboard } from './dashboard-context';
import { comparisonMonth } from './season-comparison';
import './season-comparison.css';

const number = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });
const signed = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1, signDisplay: 'exceptZero' });
const monthName = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' });

export function SeasonComparison() {
  const { state, archive, index } = useDashboard();
  const { filters, collection } = state;
  const { sensor, area, country } = filters;
  const range = comparisonMonth(filters.selectedDay || filters.endDate);
  const startDate = range?.startDate;
  const endDate = range?.endDate;
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has('compare')) return;
    const frame = requestAnimationFrame(() => {
      heading.current?.focus({ preventScroll: true });
      heading.current?.scrollIntoView({ block: 'start' });
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  const point = useMemo(() => {
    if (archive.active || !startDate || !endDate) return undefined;
    return historicalTrends(index, collection.metadata, { sensor, startDate, endDate, metric: 'detections' }, 'month')[0];
  }, [archive.active, collection.metadata, endDate, index, sensor, startDate]);

  const unit = metricUnit('detections', collection.metadata.record_unit);
  const value = point?.value ?? null;
  const baseline = point?.baseline ?? null;
  const max = Math.max(value ?? 0, baseline ?? 0, 1);
  const areaLabel = area?.properties.kind === 'radius' ? `${area.properties.radiusKm} km radius` : area ? 'Selected area' : 'All locations';
  const location = country ? `${countryName(country)}${area ? ` · ${areaLabel}` : ''}` : areaLabel;
  const reason = archive.active ? 'The archive does not provide verified coverage for this comparison.'
    : sensor === 'ALL' ? 'Choose one sensor or harmonized dataset to compare counts.'
    : point?.baselineReason ?? 'Select a dated period to compare activity.';
  const delta = point?.absoluteAnomaly ?? null;
  const percent = point?.percentageAnomaly ?? null;

  return <section className="dashboard-section season-comparison" aria-labelledby="season-title">
    <div className="season-heading">
      <div><h2 id="season-title" ref={heading} tabIndex={-1}>Compare with past seasons</h2>
        <p>{location} · {startDate ? monthName.format(new Date(startDate)) : 'No month selected'} · {sensor} · UTC</p></div>
      <span className="season-coverage">{point?.complete ? 'Complete month' : 'Coverage unverified'}</span>
    </div>
    <div className="season-panel">
      <div className="season-bars" key={`${startDate}:${sensor}:${value}:${baseline}`}>
        {[{ label: 'Selected month', count: value }, { label: 'Same month · preceding 3 years', count: baseline }].map(({ label, count }, i) =>
          <div key={label}>
            <div className="season-bar-label"><span>{label}</span><strong>{count === null ? 'Unavailable' : `${number.format(count)} ${unit}`}</strong></div>
            <div className="season-track" aria-hidden="true">{count !== null && <div className={i ? 'season-bar reference' : 'season-bar'} style={{ width: `${100 * count / max}%` }} />}</div>
          </div>)}
      </div>
      <div className="season-change"><span>Change from baseline</span>
        <strong>{delta === null ? 'Unavailable' : `${signed.format(delta)} ${unit}`}</strong>
        {percent !== null && <span>{signed.format(percent)}%</span>}
        {baseline === 0 && <span>Percentage undefined at zero baseline</span>}
      </div>
    </div>
    <p className="scientific-note">{reason} · {collection.metadata.source === 'simulated' ? 'Simulated examples' : collection.metadata.source_name || collection.metadata.source}</p>
  </section>;
}
