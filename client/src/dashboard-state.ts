import { datasetDateBounds, dateRangeError, validDate } from './analytics-engine.ts';
import { SENSOR_IDS, availableSensors, type DashboardFilters, type FireCollection } from './analytics-model.ts';
import { validateArea } from './area-selection.ts';

export interface DashboardState {
  collection: FireCollection;
  loadedCollection: FireCollection | null;
  filters: DashboardFilters;
  status: 'loading' | 'ready' | 'error';
  error: string;
  uploadStatus: 'idle' | 'uploading' | 'done' | 'error';
  uploadMessage: string;
}

function filtersFor(collection: FireCollection, previous?: DashboardFilters): DashboardFilters {
  const available = availableSensors(collection);
  const [startDate, endDate] = datasetDateBounds(collection);
  return { area: previous?.area ?? null, startDate, endDate, sensor: available[0] ?? 'MODIS', metric: previous?.metric ?? 'detections', selectedDay: null };
}

export function initialDashboardState(collection: FireCollection): DashboardState {
  return { collection, loadedCollection: null, filters: filtersFor(collection), status: 'loading', error: '', uploadStatus: 'idle', uploadMessage: '' };
}

export type DashboardAction =
  | { type: 'loaded'; collection: FireCollection; remember: boolean }
  | { type: 'filters'; patch: Partial<DashboardFilters> }
  | { type: 'status'; status: DashboardState['status']; error?: string }
  | { type: 'upload'; status: DashboardState['uploadStatus']; message: string }
  | { type: 'return-loaded' };

export function dashboardReducer(state: DashboardState, action: DashboardAction): DashboardState {
  switch (action.type) {
    case 'loaded': return { ...state, collection: action.collection, loadedCollection: action.remember ? action.collection : state.loadedCollection, filters: filtersFor(action.collection, state.filters), status: 'ready', error: '' };
    case 'return-loaded': return state.loadedCollection ? { ...state, collection: state.loadedCollection, filters: filtersFor(state.loadedCollection, state.filters), status: 'ready', error: '' } : state;
    case 'status': return { ...state, status: action.status, error: action.error ?? '' };
    case 'upload': return { ...state, uploadStatus: action.status, uploadMessage: action.message };
    case 'filters': {
      const filters = { ...state.filters, ...action.patch };
      if (dateRangeError(filters.startDate, filters.endDate) || (filters.area && validateArea(filters.area))) return state;
      if (!['ALL', ...SENSOR_IDS].includes(filters.sensor) || !['detections', 'mean-frp'].includes(filters.metric)) return state;
      if (filters.selectedDay && (!validDate(filters.selectedDay) || filters.selectedDay < filters.startDate || filters.selectedDay > filters.endDate)) filters.selectedDay = null;
      return { ...state, filters };
    }
  }
}
