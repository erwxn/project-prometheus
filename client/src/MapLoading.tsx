/** Announces archive map work without suggesting that no fires were detected. */
export function MapLoading() {
  return <div className="map-loading" role="status" aria-live="polite">
    <span className="map-loading-spinner" aria-hidden="true" />
    <div><strong>Loading satellite observations…</strong><span>Fetching records for your selected period. Larger VIIRS selections can take longer.</span></div>
  </div>;
}
