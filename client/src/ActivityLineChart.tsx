import { useId, useState } from 'react';

export interface ChartSeries { id: string; label: string; values: (number | null)[]; color: string; dash?: string; complete?: boolean[] }
const number = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });
export function ActivityLineChart({ title, labels, series, unit, selectedIndex = -1 }: { title: string; labels: string[]; series: ChartSeries[]; unit: string; selectedIndex?: number }) {
  const id = useId();
  const [detail, setDetail] = useState('Hover or focus a point for its exact value.');
  const values = series.flatMap(s => s.values.flatMap(value => value === null ? [] : [value]));
  const step = Math.max(unit === 'detections' ? 1 : .1, Math.ceil(Math.max(1, ...values) / 4));
  const ceiling = step * 4, left = 64, right = 706, top = 24, bottom = 230;
  const x = (index: number) => left + index / Math.max(1, labels.length - 1) * (right - left);
  const y = (value: number) => bottom - value / ceiling * (bottom - top);
  const tickCount = Math.min(labels.length, 7);
  const ticks = new Set(Array.from({ length: tickCount }, (_, i) => Math.round(i * (labels.length - 1) / Math.max(1, tickCount - 1))));
  return <div className="activity-line-chart">
    {!values.length ? <p className="dashboard-unavailable">No activity values are available for this chart.</p> : <>
      <div className="chart-scroll" role="region" aria-label={`${title} chart`} tabIndex={0}><svg viewBox="0 0 736 278" role="group" aria-labelledby={`${id}-title ${id}-description`}>
        <title id={`${id}-title`}>{title}</title><desc id={`${id}-description`}>Activity in {unit}. Missing values break the lines. Exact values are available in the data table.</desc>
        {[0, 1, 2, 3, 4].map(tick => <g key={tick}><line className="chart-grid" x1={left} x2={right} y1={y(tick * step)} y2={y(tick * step)} /><text x={left - 10} y={y(tick * step) + 4} textAnchor="end">{number.format(tick * step)}</text></g>)}
        <text x={left} y="13" className="chart-unit">{unit}</text>
        {selectedIndex >= 0 && <line className="chart-selection" x1={x(selectedIndex)} x2={x(selectedIndex)} y1={top} y2={bottom} />}
        {labels.map((label, i) => ticks.has(i) && <text key={i} x={x(i)} y={bottom + 25} textAnchor={i === 0 ? 'start' : i === labels.length - 1 ? 'end' : 'middle'}>{label}</text>)}
        {series.map(s => {
          const segments: string[] = []; let segment = '';
          s.values.forEach((value, i) => { if (value === null) { if (segment) segments.push(segment); segment = ''; } else segment += `${segment ? ' L' : 'M'}${x(i)},${y(value)}`; });
          if (segment) segments.push(segment);
          return <g key={s.id}>
            {segments.map((d, i) => <path key={i} d={d} fill="none" stroke={s.color} strokeWidth="2.3" strokeDasharray={s.dash} />)}
            {s.values.map((value, i) => value === null ? null : <circle key={i} cx={x(i)} cy={y(value)} r="4" fill={s.complete?.[i] === false ? '#fcfcfa' : s.color} stroke={s.color} strokeWidth="2" tabIndex={0} role="img" aria-label={`${s.label}, ${labels[i]}: ${value} ${unit}${s.complete?.[i] === false ? '; partial coverage' : ''}`} onMouseEnter={() => setDetail(`${s.label} · ${labels[i]} · ${value} ${unit}${s.complete?.[i] === false ? ' · partial coverage' : ''}`)} onFocus={() => setDetail(`${s.label} · ${labels[i]} · ${value} ${unit}${s.complete?.[i] === false ? ' · partial coverage' : ''}`)}><title>{s.label} · {labels[i]} · {value} {unit}</title></circle>)}
          </g>;
        })}
      </svg></div>
      <div className="chart-legend">{series.map(s => <span key={s.id}><svg width="28" height="10" aria-hidden="true"><line x1="0" x2="28" y1="5" y2="5" stroke={s.color} strokeWidth="2.5" strokeDasharray={s.dash} /></svg>{s.label}</span>)}</div>
      <p className="chart-point-detail" role="status">{detail}</p>
    </>}
    <details className="chart-data"><summary>View chart data</summary><div className="analytics-table-scroll" tabIndex={0} role="region" aria-label={`${title} data`}><table className="analytics-table"><caption>{title} · {unit}</caption><thead><tr><th scope="col">Period</th>{series.map(s => <th key={s.id} scope="col">{s.label}</th>)}</tr></thead><tbody>{labels.map((label, i) => <tr key={i}><th scope="row">{label}</th>{series.map(s => <td key={s.id}>{s.values[i] === null ? 'Unavailable' : number.format(s.values[i])}{s.complete?.[i] === false && s.values[i] !== null ? ' *' : ''}</td>)}</tr>)}</tbody></table></div></details>
  </div>;
}
