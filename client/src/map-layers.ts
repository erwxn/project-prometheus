import { selectRange, selectScope } from './analytics-engine.ts';
import type { DashboardFilters, PreparedObservation, Sensor } from './analytics-model.ts';

export function selectMapLayers(rows: PreparedObservation[], filters: DashboardFilters, layers: readonly Sensor[]) {
  return selectRange(selectScope(rows, { ...filters, sensor: 'ALL', simulatedPlatform: null }), filters)
    .filter(row => row.sensor !== null && layers.includes(row.sensor));
}
