import { useId, useState } from 'react';

export interface ChartSeries { id: string; label: string; values: (number | null)[]; color: string; dash?: string; complete?: boolean[] }
const standardNumber = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });
const densityNumber = new Intl.NumberFormat(undefined, { maximumSignificantDigits: 4 });
export function ActivityLineChart({ title, labels, series, unit, selectedIndex = -1, xAxisLabel = 'UTC period', pointSpacing = 0, display = 'line', onPointInspect }: { title: string; labels: string[]; series: ChartSeries[]; unit: string; selectedIndex?: number; xAxisLabel?: string; pointSpacing?: number; display?: 'line' | 'bar'; onPointInspect?: (index: number) => void }) {
  const id = useId();
  const [detail, setDetail] = useState('Hover or focus a point for its exact value.');
  const values = series.flatMap(s => s.values.flatMap(value => value === null ? [] : [value]));
  const density = unit === 'detections per 1,000 km²';
  const number = density ? densityNumber : standardNumber;
  const targetStep = Math.max(0, ...values) / 4;
  const magnitude = targetStep > 0 ? 10 ** Math.floor(Math.log10(targetStep)) : 1;
  const step = density && targetStep > 0 ? Math.ceil(targetStep / magnitude) * magnitude : Math.max(1, Math.ceil(targetStep));
  const ceiling = step * 4, left = 72, chartWidth = Math.max(736, left + 30 + Math.max(1, labels.length - 1) * pointSpacing), right = chartWidth - 30, top = 24, bottom = 230;
  const x = (index: number) => left + index / Math.max(1, labels.length - 1) * (right - left);
  const y = (value: number) => bottom - value / ceiling * (bottom - top);
  const tickCount = Math.min(labels.length, 7);
  const ticks = new Set(Array.from({ length: tickCount }, (_, i) => Math.round(i * (labels.length - 1) / Math.max(1, tickCount - 1))));
  return <div className="activity-line-chart">
    {!values.length ? <p className="dashboard-unavailable">No activity values are available for this chart.</p> : <>
      <div className="chart-scroll" role="region" aria-label={`${title} chart`} tabIndex={0}><svg viewBox={`0 0 ${chartWidth} 286`} style={{ width: chartWidth, minWidth: chartWidth }} role="group" aria-labelledby={`${id}-title ${id}-description`}>
        <title id={`${id}-title`}>{title}</title><desc id={`${id}-description`}>Activity in {unit}. Missing values break the lines. Exact values are available in the data table.</desc>
        {[0, 1, 2, 3, 4].map(tick => <g key={tick}><line className="chart-grid" x1={left} x2={right} y1={y(tick * step)} y2={y(tick * step)} /><text x={left - 10} y={y(tick * step) + 4} textAnchor="end">{number.format(tick * step)}</text></g>)}
        <text x={left} y="13" className="chart-unit">Y · {unit}</text>
        <text x={(left + right) / 2} y="280" textAnchor="middle" className="chart-unit">X · {xAxisLabel}</text>
        {selectedIndex >= 0 && <line className="chart-selection" x1={x(selectedIndex)} x2={x(selectedIndex)} y1={top} y2={bottom} />}
        {labels.map((label, i) => ticks.has(i) && <text key={i} x={x(i)} y={bottom + 25} textAnchor={i === 0 ? 'start' : i === labels.length - 1 ? 'end' : 'middle'}>{label}</text>)}
        {display === 'bar' ? labels.map((label, labelIndex) => {
          const entries = series.flatMap(item => item.values[labelIndex] === null ? [] : [{ item, value: item.values[labelIndex]! }]);
          const slot = Math.max(40, labels.length > 1 ? x(Math.min(labelIndex + 1, labels.length - 1)) - x(Math.max(labelIndex - 1, 0)) : 100);
          const width = Math.min(64, slot * .62 / Math.max(1, entries.length));
          return <g key={label}>{entries.map(({ item, value }, entryIndex) => {
            const center = x(labelIndex) + (entryIndex - (entries.length - 1) / 2) * width;
            const height = Math.max(2, bottom - y(value));
            const detail = `${item.label} · ${label} · ${number.format(value)} ${unit}${item.complete?.[labelIndex] === false ? ' · incomplete or unknown coverage' : ''}`;
            return <g key={item.id}><rect className="chart-bar" x={center - width * .42} y={bottom - height} width={width * .84} height={height} rx="3" fill={item.color} tabIndex={0} role="button" aria-label={detail} onMouseEnter={() => setDetail(detail)} onFocus={() => setDetail(detail)} onClick={() => setDetail(detail)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setDetail(detail); } }}><title>{detail}</title></rect><text className="chart-value" x={center} y={Math.max(top + 10, y(value) - 7)} textAnchor="middle">{number.format(value)}</text></g>;
          })}</g>;
        }) : series.map(s => {
          const segments: string[] = []; let segment = '';
          s.values.forEach((value, i) => { if (value === null) { if (segment) segments.push(segment); segment = ''; } else segment += `${segment ? ' L' : 'M'}${x(i)},${y(value)}`; });
          if (segment) segments.push(segment);
          return <g key={s.id}>
            {segments.map((d, i) => <path key={i} d={d} fill="none" stroke={s.color} strokeWidth="2.3" strokeDasharray={s.dash} />)}
            {s.values.map((value, i) => {
              if (value === null) return null;
              const text = `${s.label} · ${labels[i]} · ${number.format(value)} ${unit}${s.complete?.[i] === false ? ' · incomplete or unknown coverage' : ''}`;
              function inspect() { setDetail(text); onPointInspect?.(i); }
              return <circle key={i} cx={x(i)} cy={y(value)} r="4" fill={s.complete?.[i] === false ? 'var(--surface, #fcfcfa)' : s.color} stroke={s.color} strokeWidth="2" tabIndex={0} role="button" aria-label={text} onMouseEnter={inspect} onFocus={inspect} onClick={inspect} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); inspect(); } }}><title>{text}</title></circle>;
            })}
          </g>;
        })}
      </svg></div>
      <div className="chart-legend">{series.map(s => <span key={s.id}><svg width="28" height="10" aria-hidden="true"><line x1="0" x2="28" y1="5" y2="5" stroke={s.color} strokeWidth="2.5" strokeDasharray={s.dash} /></svg>{s.label}</span>)}</div>
      <p className="chart-point-detail" role="status">{detail}</p>
    </>}
    <details className="chart-data"><summary>View chart data</summary><div className="analytics-table-scroll" tabIndex={0} role="region" aria-label={`${title} data`}><table className="analytics-table"><caption>{title} · {unit}</caption><thead><tr><th scope="col">Period</th>{series.map(s => <th key={s.id} scope="col">{s.label}</th>)}</tr></thead><tbody>{labels.map((label, i) => <tr key={i}><th scope="row">{label}</th>{series.map(s => <td key={s.id}>{s.values[i] === null ? 'Unavailable' : number.format(s.values[i])}{s.complete?.[i] === false && s.values[i] !== null ? ' *' : ''}</td>)}</tr>)}</tbody></table></div></details>
  </div>;
}
