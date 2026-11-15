import { selectRange, selectScope } from './analytics-engine.ts';
import type { DashboardFilters, PreparedObservation, Sensor } from './analytics-model.ts';

export function selectMapLayers(rows: PreparedObservation[], filters: DashboardFilters, layers: readonly Sensor[]) {
  return selectRange(selectScope(rows, { ...filters, sensor: 'ALL', simulatedPlatform: null }), filters)
    .filter(row => row.sensor !== null && layers.includes(row.sensor));
}

/** Keeps Algeria's scored population visible while preserving Morocco's frozen model decision. */
export function modelCellVisible(properties: import('./fire-data.ts').FireFeature['properties'], strict: boolean, cellDelivery: boolean) {
  if (properties.record_unit === 'model_candidate') {
    return (properties.country_iso3 === 'DZA' || properties.detect_f1 === true) && (!strict || (properties.harmonization_score ?? -1) >= 0.5);
  }
  return !cellDelivery || !strict || properties.record_unit !== 'predicted_cell' || (properties.p_viirs ?? -1) >= 0.5;
}
