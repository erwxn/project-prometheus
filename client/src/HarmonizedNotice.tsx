import {useDashboard} from './dashboard-context';

/** Makes the producer's counting unit explicit wherever harmonized data is explored. */
export function HarmonizedNotice() {
  const {state, archive} = useDashboard();
  const meta = state.collection.metadata;
  if (meta.gold) return <section className="harmonized-notice" aria-label="Morocco Gold data"><h3>Morocco · Azure Gold</h3>
    <p>{meta.gold_sensor === 'Harmonized' ? 'Model candidate cells from the committed Gold catalog. Scores are uncalibrated model outputs, not probabilities or confirmed fire detections.' : `${meta.gold_sensor || 'Satellite'} observations from the committed Gold catalog.`}</p>
    <p>{state.collection.features.length.toLocaleString()} loaded records · Historical data · 2026 excluded. Missing records do not mean zero activity.</p>
    {meta.feed_status === 'stale' && <p role="status">The update failed; showing the last verified Morocco publication.</p>}
    {state.error && <p role="alert">{state.error}</p>}
  </section>;
  if (archive.active || !meta.delivery_format) return null;
  return <section className="harmonized-notice" aria-label="Harmonized data interpretation">
    <h3>{meta.preview ? 'Historical delivery preview' : 'Harmonized historical data'}</h3>
    <p>{meta.record_unit === 'predicted_cell'
      ? 'Each record is a model-predicted 500 m cell selected by detect_f1, not a confirmed VIIRS detection or a separate fire.'
      : 'Each record is a fire group from one satellite pass, not a distinct real-world fire.'}</p>
    <p>{meta.record_unit === 'predicted_cell' ? `${meta.predicted_cells?.toLocaleString()} selected cells from ${meta.candidate_cells?.toLocaleString()} candidates · ` : ''}{meta.fire_groups?.toLocaleString()} groups in the full publication. Filters below may select fewer records.</p>
    <details><summary>Interpretation and validation</summary>
      <ul>{meta.limitations?.map(limit => <li key={limit}>{limit}</li>)}</ul>
      <p>Counts and cell FRP describe selected model output. Group FRP must be counted once per group. Probabilities describe model estimates, not operational alerts.</p>
      {meta.validation && Object.keys(meta.validation).length > 0 && <details><summary>Producer validation results</summary><p>Reported by the data producer for this delivery; validation rows may cover only a subset of cells.</p><pre>{JSON.stringify(meta.validation, null, 2)}</pre></details>}
    </details>
  </section>;
}
