import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useDashboard } from './dashboard-context';
import { activityDay, dateTime, enumerateDates, isoDate, UTC_DAY } from './analytics-engine';
import { metricLabel, metricUnit } from './analytics-model';

const number = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });
const months = Array.from({ length: 12 }, (_, month) => new Intl.DateTimeFormat('en', { month: 'short', timeZone: 'UTC' }).format(Date.UTC(2025, month, 1)));
const availabilityLabels = { complete: 'Complete coverage', partial: 'Detections recorded; coverage incomplete or unknown', unknown: 'No records; coverage unknown', unavailable: 'No data available' };

export function ActivityCalendar() {
  const { state, dispatch, index, archive, calendarFocus, setCalendarFocus } = useDashboard();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (!calendarFocus) return;
    const frame = window.requestAnimationFrame(() => {
      heading.current?.focus();
      setCalendarFocus(false);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [calendarFocus, setCalendarFocus]);
  const { filters, collection } = state;
  const [view, setView] = useState<'year' | 'month'>('year');
  const [year, setYear] = useState(''), [month, setMonth] = useState('01');
  const [previousRange, setPreviousRange] = useState('');
  const rangeKey = `${filters.startDate}:${filters.endDate}`;
  if(archive.active && previousRange!==rangeKey){setPreviousRange(rangeKey);setMonth(filters.startDate.slice(5,7)||'01');}
  const [focused, setFocused] = useState(''), [hovered, setHovered] = useState('');
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const tooltipId = useId();
  const years = useMemo(() => filters.startDate && filters.endDate ? Array.from({ length: Number(filters.endDate.slice(0, 4)) - Number(filters.startDate.slice(0, 4)) + 1 }, (_, index) => String(Number(filters.startDate.slice(0, 4)) + index)) : [], [filters.startDate, filters.endDate]);
  const calendarYears = archive.active && archive.catalog ? [...new Set(archive.catalog.partitions.filter(p=>archive.platform==='ALL'||p.platform===archive.platform).map(p=>p.month.slice(0,4)))].sort().reverse() : years;
  const visibleYear = years.includes(year) ? year : years.at(-1) ?? '2025';
  const start = view === 'year' ? `${visibleYear}-01-01` : `${visibleYear}-${month}-01`;
  const end = view === 'year' ? `${visibleYear}-12-31` : isoDate(Date.UTC(Number(visibleYear), Number(month), 0));
  const days = useMemo(() => enumerateDates(start, end).map(date => activityDay(date, index, collection.metadata, filters.sensor, filters.metric)), [start, end, index, collection.metadata, filters.sensor, filters.metric]);
  const thresholds = useMemo(() => {
    const values = days.flatMap(day => day.value !== null && day.value > 0 ? [day.value] : []).sort((a, b) => a - b);
    return [...new Set([.25, .5, .75, 1].flatMap(q => values.length ? [values[Math.ceil(values.length * q) - 1]] : []))];
  }, [days]);
  const offset = (new Date(dateTime(start)).getUTCDay() + 6) % 7;
  const cells = [...Array<null>(offset).fill(null), ...days];
  const detail = days.find(day => day.date === hovered) ?? days.find(day => day.date === filters.selectedDay) ?? days.find(day => day.date >= filters.startDate && day.date <= filters.endDate) ?? days[0];
  const focusDate = days.some(day => day.date === focused) ? focused : detail?.date;

  function onKey(event: KeyboardEvent<HTMLButtonElement>, date: string) {
    const delta = view === 'year' ? { ArrowRight: 7, ArrowLeft: -7, ArrowDown: 1, ArrowUp: -1 } : { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 7, ArrowUp: -7 };
    const step = delta[event.key as keyof typeof delta];
    let next = date;
    if (step) next = isoDate(dateTime(date) + step * UTC_DAY);
    else if (event.key === 'Home') next = start;
    else if (event.key === 'End') next = end;
    else return;
    event.preventDefault();
    if (buttons.current.has(next)) { setFocused(next); buttons.current.get(next)?.focus(); }
  }
  const dayLabel = (day: typeof days[number]) => `${day.date} · ${metricLabel(filters.metric, collection.metadata.record_unit)}: ${day.value === null ? 'unavailable' : `${number.format(day.value)} ${metricUnit(filters.metric, collection.metadata.record_unit)}`} · ${day.count} ${metricUnit('detections', collection.metadata.record_unit)} · ${filters.sensor} · ${availabilityLabels[day.availability]}${day.method ? ` · ${day.method}` : ''}`;

  return <section className="dashboard-section activity-calendar" aria-labelledby="calendar-title" aria-busy={archive.busy}>
    <div className="section-toolbar"><div><span className="section-number">01 / DAILY OBSERVATIONS</span><h2 id="calendar-title" ref={heading} tabIndex={-1}>Burning activity calendar</h2><p>{collection.metadata.record_unit ? 'Harmonized model output by UTC day.' : 'Satellite-observed activity by UTC day.'} Select a day to focus the map and summaries.</p></div>
      <div className="inline-controls"><label>View<select value={view} onChange={e => setView(e.target.value as typeof view)}><option value="year">Yearly</option><option value="month">Monthly</option></select></label>
        {years.length > 0 && <label>Calendar year<select value={visibleYear} onChange={e => {setYear(e.target.value); if(archive.active) archive.changeYear(e.target.value);}}>{calendarYears.map(year => <option key={year}>{year}</option>)}</select></label>}
        {view === 'month' && <label>Calendar month<select value={month} onChange={e => setMonth(e.target.value)}>{months.map((name, i) => <option key={name} value={String(i + 1).padStart(2, '0')}>{name}</option>)}</select></label>}
      </div>
    </div>
    {archive.busy && <p role="status">Loading daily aggregates for the applied archive selection…</p>}
    {!years.length ? <p className="dashboard-unavailable">Dated observations are needed for a calendar. Load a MODIS CSV or explicitly choose simulated history.</p> : <>
      <div className="calendar-scroll" role="region" aria-label={`${view === 'year' ? visibleYear : `${months[Number(month) - 1]} ${visibleYear}`} activity calendar`} tabIndex={0}>
        {view === 'year' && <div className="calendar-month-labels">{months.map((label, i) => <span key={label} style={{ gridColumn: `${Math.floor(((dateTime(`${visibleYear}-${String(i + 1).padStart(2, '0')}-01`) - dateTime(start)) / UTC_DAY + offset) / 7) + 1} / span 1` }}>{label}</span>)}</div>}
        {view === 'month' && <div className="calendar-weekday-labels">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => <span key={day}>{day}</span>)}</div>}
        <div className={`calendar-cells ${view}`} role="group" aria-label="Daily activity; use arrow keys to move between days">
          {cells.map((day, index) => {
            if (!day) return <span className="calendar-spacer" key={`blank-${index}`} />;
            const outside = day.date < filters.startDate || day.date > filters.endDate;
            const level = day.value === null ? -1 : day.value === 0 ? 0 : thresholds.findIndex(value => day.value! <= value) + 1;
            return <button key={day.date} ref={element => { if (element) buttons.current.set(day.date, element); else buttons.current.delete(day.date); }} type="button"
              className={`calendar-day ${day.value === null ? 'missing' : ''} ${day.availability}${outside ? ' outside' : ''}`} data-level={level} data-date={day.date}
              aria-label={`${dayLabel(day)}${outside ? ' · Outside selected date range' : ''}`} aria-describedby={hovered === day.date ? tooltipId : undefined} aria-pressed={filters.selectedDay === day.date} aria-disabled={outside} tabIndex={focusDate === day.date ? 0 : -1}
              onKeyDown={event => onKey(event, day.date)} onFocus={() => { setFocused(day.date); setHovered(day.date); }} onMouseEnter={() => setHovered(day.date)}
              onClick={() => { setHovered(day.date); if (!outside) dispatch({ type: 'filters', patch: { selectedDay: filters.selectedDay === day.date ? null : day.date } }); }}>
              {view === 'month' ? <><span>{Number(day.date.slice(8))}</span><strong>{day.value === null ? '—' : number.format(day.value)}</strong>{day.availability === 'partial' && <small aria-hidden="true">•</small>}</> : <span className="visually-hidden">{day.date}</span>}
            </button>;
          })}
        </div>
      </div>
      <div className="calendar-legend" aria-label="Activity intensity legend"><span>{metricLabel(filters.metric, collection.metadata.record_unit)} · {metricUnit(filters.metric, collection.metadata.record_unit)}</span><span><i data-level="0" />0 · coverage known</span>{thresholds.map((threshold, i) => <span key={i}><i data-level={i + 1} />≤ {number.format(threshold)}</span>)}<span><i className="unknown" />Unknown / unavailable</span><span>• Incomplete coverage</span></div>
      {detail && <div id={tooltipId} className="calendar-detail" role="tooltip"><strong>{detail.date}</strong><span>{detail.value === null ? `${metricLabel(filters.metric, collection.metadata.record_unit)} unavailable` : `${number.format(detail.value)} ${metricUnit(filters.metric, collection.metadata.record_unit)}`}</span><span>{number.format(detail.count)} {!archive.active && collection.metadata.record_unit === 'predicted_cell' ? 'predicted cells' : !archive.active && collection.metadata.record_unit === 'fire_group' ? 'fire groups' : 'satellite hotspot detections'}{filters.metric === 'mean-frp' ? ` · ${detail.frpCount} FRP readings` : ''}</span><span>{filters.sensor}{detail.method ? ` · ${detail.method}` : filters.sensor === 'Harmonized' ? ' · method not supplied' : ' · raw observations'}</span><span>{availabilityLabels[detail.availability]}</span></div>}
    </>}
    <p className="scientific-note">No records in a hotspot-only CSV do not establish a fire-free day. Unknown coverage is hatched; a known zero has its own fill. Use Tab, arrow keys, and Enter to explore days.</p>
  </section>;
}
