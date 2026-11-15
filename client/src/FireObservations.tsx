import { useMemo, useState } from 'react';
import { getDisplayFRP, type FireFeature } from './fire-data';
import { observationFrp } from './analytics-model';
import { observationTime, type TimeBasis } from './timeline';
import { observationPage } from './observation-list';

interface Props {
  fires: FireFeature[];
  timeBasis: TimeBasis;
  selected: FireFeature | null;
  onSelect: (fire: FireFeature) => void;
  onFit: () => void;
}

export function FireObservations({ fires, timeBasis, selected, onSelect, onFit }: Props) {
  const [sort, setSort] = useState('frp');
  const [page, setPage] = useState(0);
  const [previousFires, setPreviousFires] = useState(fires);
  // Reset pagination when source, dataset, or timeline changes the matching records.
  if (previousFires !== fires) { setPreviousFires(fires); setPage(0); }
  const ordered = useMemo(() => [...fires].sort((a, b) => {
    if (sort === 'frp') return getDisplayFRP(b) - getDisplayFRP(a);
    const time = (fire: FireFeature) => {
      const value = observationTime(fire, timeBasis);
      return Number.isFinite(value) ? value : -Infinity;
    };
    return time(b) - time(a);
  }), [fires, sort, timeBasis]);
  const { start, rows } = observationPage(ordered, page);

  return <section className="panel-section hotspot-section" aria-labelledby="hotspots-title">
    <div className="section-heading"><h3 id="hotspots-title">Observations</h3><span>{fires.length.toLocaleString()} records</span></div>
    <p className="hotspot-hint">Select a record to inspect its location and FRP. {fires.some(f => f.properties.record_unit === 'model_candidate') ? 'Each record is a model candidate cell, not a confirmed satellite detection.' : fires.some(f => f.properties.record_unit === 'predicted_cell') ? 'Each record is a model-selected cell, not a confirmed satellite detection.' : 'Each record is an observation or model group, not a separate fire.'}</p>
    <div className="observation-tools">
      <label>Sort by<select value={sort} onChange={event => { setSort(event.target.value); setPage(0); }}>
        <option value="frp">Highest FRP</option><option value="time">Latest in selected clock</option>
      </select></label>
      <button type="button" className="fit-hotspots" onClick={onFit} disabled={!fires.length}>Fit all</button>
    </div>
    <div className="observation-columns" aria-hidden="true"><span>Source / location</span><span>FRP · MW</span></div>
    <div className="hotspot-list">
      {rows.map((fire, index) => {
        const [lng, lat] = fire.geometry.coordinates;
        const p = fire.properties;
        const frp = observationFrp(fire);
        return <button type="button" key={start + index} className="hotspot-row" aria-pressed={fire === selected} onClick={() => onSelect(fire)} aria-label={`Inspect ${p.satellite} at ${lat.toFixed(3)}, ${lng.toFixed(3)}, ${frp === null ? 'FRP unavailable' : `${frp.toFixed(1)} megawatts`}`}>
          <span className="observation-swatch" style={{ backgroundColor: frp === null ? '#9aabb9' : frp < 50 ? '#ffeb3b' : frp <= 150 ? '#ff9800' : '#ff2d00' }} aria-hidden="true" />
          <span><strong>{p.platform || p.satellite}</strong><small>{Math.abs(lat).toFixed(3)}°{lat >= 0 ? 'N' : 'S'}, {Math.abs(lng).toFixed(3)}°{lng >= 0 ? 'E' : 'W'}</small><small>{timeBasis === 'utc' ? `${p.observed_at_utc?.slice(0, 10) || 'Undated'} ${p.acq_time_utc} UTC` : `${p.local_solar_date || 'Undated'} ${p.local_solar_time} solar`}</small></span>
          <span className="observation-frp">{frp?.toFixed(1) ?? '—'}</span>
        </button>;
      })}
      {!fires.length && <p className="hotspot-hint">No matching observations. Try another source or show the full time range.</p>}
    </div>
    <nav className="observation-pagination" aria-label="Observation pages">
      <button type="button" disabled={page === 0} onClick={() => setPage(value => value - 1)} aria-label="Previous observations">Previous</button>
      <span role="status">{fires.length ? `${start + 1}–${Math.min(start + 20, fires.length)} of ${fires.length.toLocaleString()}` : '0 records'}</span>
      <button type="button" disabled={start + 20 >= fires.length} onClick={() => setPage(value => value + 1)} aria-label="Next observations">Next</button>
    </nav>
  </section>;
}
