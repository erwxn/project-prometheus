import { predictionBands, probabilityLabel, type MoroccoPredictions } from './morocco-predictions';

const monthLabel = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' });

interface Props {
  active: boolean;
  data: MoroccoPredictions | null;
  error: string;
  years: string[];
  dates: string[];
  date: string;
  selected: number | null;
  onToggle(): void;
  onRetry(): void;
  onYear(year: string): void;
  onDate(date: string): void;
  onZoom(): void;
}

export function MoroccoPredictionPanel({ active, data, error, years, dates, date, selected, onToggle, onRetry, onYear, onDate, onZoom }: Props) {
  const year = date.slice(0, 4);
  const evaluation = data?.evaluation;
  const score = evaluation?.test_2025[evaluation.chosen_model];
  return <section className="monitor-history morocco-prediction" aria-labelledby="morocco-prediction-title">
    <h2 id="morocco-prediction-title">Morocco monthly predictions</h2>
    <button type="button" onClick={onToggle}>{active ? 'Back to recent observations' : 'Show predictions'}</button>
    {active && (error ? <p role="alert">{error} <button type="button" onClick={onRetry}>Retry</button></p>
      : !data ? <p role="status">Loading predictions…</p>
      : <>
        <label>Prediction year<select value={year} onChange={event => onYear(event.target.value)}>
          {years.map(value => <option key={value} value={value}>{value}</option>)}
        </select></label>
        <label>Month (UTC)<select value={date} onChange={event => onDate(event.target.value)}>
          {dates.map(value => <option key={value} value={value}>{monthLabel.format(new Date(value))}</option>)}
        </select></label>
        <button type="button" onClick={onZoom}>Show Morocco on map</button>
        <p>If NOAA‑20 records a hotspot in Morocco in the selected month, the colors show where it is more likely to be located. The 10 km grid uses detections from 2019–{evaluation?.training_end_by_year[year]}.</p>
        <ul aria-label="Predicted share of detections by cell">{predictionBands.map(band => <li key={band.label}>
          <i aria-hidden="true" style={{ backgroundColor: `rgb(${band.color.slice(0, 3).join(' ')})` }} />{band.label}
        </li>)}</ul>
        <p role="status">{selected === null ? 'Select a shaded cell to inspect its estimate.' : `Predicted share of Moroccan detections in this cell: ${probabilityLabel(selected)}`}</p>
        {evaluation && score && <details>
          <summary>2025 backtest</summary>
          <p>{evaluation.source}. The highest-scoring 10% of grid cells contained {probabilityLabel(score.top_decile_capture)} of the {score.detection_cell_days.toLocaleString()} held-out detection cell-days in 2025.</p>
          <p>The backtest evaluates detection location. The 2026 model uses the 2025 observations as additional training data.</p>
          <p>Grid boundary derived from <a href="https://github.com/wmgeolab/geoBoundaries/blob/9469f09/releaseData/gbOpen/MAR/ADM0/geoBoundaries-MAR-ADM0.geojson">geoBoundaries Morocco ADM0 (ODbL 1.0)</a>.</p>
        </details>}
      </>)}
  </section>;
}
