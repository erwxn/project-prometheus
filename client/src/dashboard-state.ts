import type { ArchiveSelection } from './archive-model';
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
  const [startDate, endDate] = collection.metadata.archive ? [collection.metadata.archive_startDate || '',collection.metadata.archive_endDate || ''] : datasetDateBounds(collection);
  return { country: previous?.country ?? null, area: previous?.area ?? null, startDate, endDate, sensor: collection.metadata.archive_sensor ?? available[0] ?? 'MODIS', metric: previous?.metric ?? 'detections', selectedDay: null };
}

export function initialDashboardState(collection: FireCollection): DashboardState {
  return { collection, loadedCollection: null, filters: filtersFor(collection), status: 'loading', error: '', uploadStatus: 'idle', uploadMessage: '' };
}

export type DashboardAction =
  | {type:'archive-apply';selection:ArchiveSelection;sensor:DashboardFilters['sensor'];reset:boolean}
  | {type:'archive-map';collection:FireCollection}
  | { type: 'loaded'; collection: FireCollection; remember: boolean }
  | { type: 'filters'; patch: Partial<DashboardFilters> }
  | { type: 'status'; status: DashboardState['status']; error?: string }
  | { type: 'upload'; status: DashboardState['uploadStatus']; message: string }
  | { type: 'return-loaded' };

export function dashboardReducer(state: DashboardState, action: DashboardAction): DashboardState {
  switch (action.type) {
    case 'archive-apply': return {...state,collection:{type:'FeatureCollection',features:[],metadata:{source:'csv',temporary:true,archive:true,archive_platform:action.selection.platform,archive_year:action.selection.year,archive_month:action.selection.month,archive_startDate:action.selection.startDate,archive_endDate:action.selection.endDate,archive_sensor:action.sensor,source_name:`Temporary archive · ${action.selection.platform}`}},filters:{...state.filters,country:action.reset?null:state.filters.country,startDate:action.selection.startDate,endDate:action.selection.endDate,sensor:action.sensor,area:action.reset?null:state.filters.area,selectedDay:null},status:'ready',error:''};
    case 'archive-map': {
      if(!state.collection.metadata.archive)return state;
      const collection={...action.collection,metadata:{...action.collection.metadata,...state.collection.metadata}};
      return {...state,collection,loadedCollection:collection};
    }
    case 'loaded': return { ...state, collection: action.collection, loadedCollection: action.remember ? action.collection : state.loadedCollection, filters: filtersFor(action.collection, state.filters), status: 'ready', error: '' };
    case 'return-loaded': return state.loadedCollection ? { ...state, collection: state.loadedCollection, filters: filtersFor(state.loadedCollection, state.filters), status: 'ready', error: '' } : state;
    case 'status': return { ...state, status: action.status, error: action.error ?? '' };
    case 'upload': return { ...state, uploadStatus: action.status, uploadMessage: action.message };
    case 'filters': {
      const filters = { ...state.filters, ...action.patch };
      if (filters.country && !/^[A-Z]{3}$/.test(filters.country)) return state;
      if (dateRangeError(filters.startDate, filters.endDate) || (filters.area && validateArea(filters.area))) return state;
      if (!['ALL', ...SENSOR_IDS].includes(filters.sensor) || !['detections', 'mean-frp'].includes(filters.metric)) return state;
      if (filters.selectedDay && (!validDate(filters.selectedDay) || filters.selectedDay < filters.startDate || filters.selectedDay > filters.endDate)) filters.selectedDay = null;
      return { ...state, filters };
    }
  }
}
