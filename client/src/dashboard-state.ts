import type { ArchiveSelection } from './archive-model';
import { datasetDateBounds, dateRangeError, validDate } from './analytics-engine.ts';
import { SENSOR_IDS, SIMULATED_PLATFORMS, availableSensors, type DashboardFilters, type FireCollection } from './analytics-model.ts';
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
  return { country: previous?.country ?? null, area: previous?.area ?? null, startDate, endDate, sensor: collection.metadata.gold_sensor ?? collection.metadata.archive_sensor ?? available[0] ?? 'MODIS', metric: previous?.metric ?? 'detections', selectedDay: null };
}

export function initialDashboardState(collection: FireCollection): DashboardState {
  return { collection, loadedCollection: null, filters: filtersFor(collection), status: 'loading', error: '', uploadStatus: 'idle', uploadMessage: '' };
}

export type DashboardAction =
  | {type:'archive-apply';selection:ArchiveSelection;sensor:DashboardFilters['sensor'];reset:boolean}
  | {type:'archive-map';collection:FireCollection}
  | { type: 'loaded'; collection: FireCollection; remember: boolean }
  | { type: 'refreshed'; collection: FireCollection }
  | { type: 'filters'; patch: Partial<DashboardFilters> }
  | { type: 'status'; status: DashboardState['status']; error?: string }
  | { type: 'upload'; status: DashboardState['uploadStatus']; message: string }
  | { type: 'return-loaded' };

export function dashboardReducer(state: DashboardState, action: DashboardAction): DashboardState {
  switch (action.type) {
    case 'refreshed': {
      if (state.collection.metadata.source !== 'harmonized' && !state.collection.metadata.gold || state.collection.metadata.archive || state.collection.metadata.uploaded) return state;
      // An unchanged publication must not reset playback or refit the map camera.
      const collection = action.collection.metadata.version && action.collection.metadata.version === state.collection.metadata.version
        ? { ...action.collection, features: state.collection.features } : action.collection;
      return { ...state, collection, loadedCollection: collection };
    }
    case 'archive-apply': return {...state,collection:{type:'FeatureCollection',features:[],metadata:{source:'csv',temporary:true,archive:true,archive_platform:action.selection.platform,archive_year:action.selection.year,archive_month:action.selection.month,archive_startDate:action.selection.startDate,archive_endDate:action.selection.endDate,archive_sensor:action.sensor,source_name:`Temporary archive · ${action.selection.platform}`}},filters:{...state.filters,country:action.reset?null:state.filters.country,startDate:action.selection.startDate,endDate:action.selection.endDate,sensor:action.sensor,area:action.reset?null:state.filters.area,selectedDay:null,simulatedPlatform:null},status:'ready',error:''};
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
      if (state.collection.metadata.gold && filters.country === 'DZA') filters.sensor = 'Harmonized';
      if (action.patch.country !== undefined && action.patch.country !== state.filters.country) filters.selectedDay = null;
      if (filters.country && !/^[A-Z]{3}$/.test(filters.country)) return state;
      if (dateRangeError(filters.startDate, filters.endDate) || (filters.area && validateArea(filters.area))) return state;
      if (!['ALL', ...SENSOR_IDS].includes(filters.sensor) || !['detections', 'mean-frp'].includes(filters.metric)) return state;
      if (filters.simulatedPlatform) {
        const allowed = filters.sensor === 'ALL' ? Object.values(SIMULATED_PLATFORMS).flat() : SIMULATED_PLATFORMS[filters.sensor];
        if (state.collection.metadata.source !== 'simulated' || !allowed.some(platform => platform === filters.simulatedPlatform)) filters.simulatedPlatform = null;
      }
      if (filters.selectedDay && (!validDate(filters.selectedDay) || filters.selectedDay < filters.startDate || filters.selectedDay > filters.endDate)) filters.selectedDay = null;
      return { ...state, filters };
    }
  }
}
