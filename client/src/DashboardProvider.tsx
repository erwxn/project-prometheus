import { useCallback, useEffect, useMemo, useReducer, useRef, type ReactNode } from 'react';
import { DashboardContext } from './dashboard-context';
import { API_BASE, FALLBACK_FIRES } from './fire-data';
import { dashboardReducer, initialDashboardState, type DashboardAction, type DashboardState } from './dashboard-state';
import { DatasetRequests, loadObservations, uploadObservations, validateUpload, parseCollection } from './fire-api';
import { dailyBuckets, prepareObservations, selectRange, selectScope, summarizeRange } from './analytics-engine';

function useDashboardValue() {
  const [state, dispatch] = useReducer(dashboardReducer, { type: 'FeatureCollection', features: FALLBACK_FIRES, metadata: { source: 'demo', source_name: 'Undated illustrative demo' } }, initialDashboardState);
  const requests = useRef(new DatasetRequests());
  const retry = useCallback(async () => {
    const request = requests.current.begin();
    dispatch({ type: 'upload', status: 'idle', message: '' });
    dispatch({ type: 'status', status: 'loading' });
    const timeout = window.setTimeout(() => request.controller.abort(), 12000);
    try {
      const collection = await loadObservations(API_BASE, request.controller.signal);
      if (requests.current.current(request.revision)) dispatch({ type: 'loaded', collection, remember: true });
    } catch (error) {
      if (requests.current.current(request.revision)) dispatch({ type: 'status', status: 'error', error: error instanceof Error ? error.message : 'The observation API is unavailable.' });
    } finally { window.clearTimeout(timeout); }
  }, []);

  useEffect(() => { void retry(); const gate = requests.current; return () => gate.cancel(); }, [retry]);
  useEffect(() => {
    if (state.status !== 'error' || state.collection.metadata.uploaded || state.collection.metadata.source === 'simulated' || state.uploadStatus === 'uploading') return;
    const timer = window.setTimeout(() => void retry(), 5000);
    return () => window.clearTimeout(timer);
  }, [retry, state.status, state.collection, state.uploadStatus]);

  const uploadCsv = useCallback(async (file: File) => {
    const error = validateUpload(file);
    if (error) { dispatch({ type: 'upload', status: 'error', message: error }); return; }
    const request = requests.current.begin();
    const timeout = window.setTimeout(() => request.controller.abort(), 60000);
    dispatch({ type: 'upload', status: 'uploading', message: `Reading ${file.name}…` });
    dispatch({ type: 'status', status: 'ready' });
    try {
      const collection = await uploadObservations(API_BASE, file, request.controller.signal);
      if (!requests.current.current(request.revision)) return;
      dispatch({ type: 'loaded', collection, remember: true });
      dispatch({ type: 'upload', status: 'done', message: `Loaded ${collection.features.length.toLocaleString()} MODIS detections from ${file.name}.${collection.metadata.rejected_rows ? ` ${collection.metadata.rejected_rows} invalid rows excluded.` : ''}` });
    } catch (error) {
      if (requests.current.current(request.revision)) dispatch({ type: 'upload', status: 'error', message: `${request.controller.signal.aborted ? 'Upload timed out.' : error instanceof Error ? error.message : 'Upload failed.'} Your current dataset has been kept.` });
    } finally { window.clearTimeout(timeout); }
  }, []);

  const showSimulatedHistory = useCallback(async () => {
    const request = requests.current.begin();
    dispatch({ type: 'upload', status: 'idle', message: '' });
    try {
      const { simulatedHistory } = await import('./historical-demo');
      if (requests.current.current(request.revision)) dispatch({ type: 'loaded', collection: simulatedHistory(), remember: false });
    } catch { if (requests.current.current(request.revision)) dispatch({ type: 'status', status: 'error', error: 'Could not load simulated history. Your current dataset has been kept.' }); }
  }, []);
  const loadTemporary = useCallback(async (platform: string, month: string, page = 0) => {
    const request = requests.current.begin();
    dispatch({type:'status',status:'loading'});
    const timeout = window.setTimeout(() => request.controller.abort(), 30000);
    try {
      const response = await fetch(`${API_BASE}/api/v1/fires/test?${new URLSearchParams({platform,month,page:String(page)})}`, {signal:request.controller.signal});
      if (!response.ok) throw new Error('Could not load this test-data slice.');
      const collection = parseCollection(await response.json());
      if (requests.current.current(request.revision)) dispatch({type:'loaded',collection,remember:true});
    } catch (error) { if (requests.current.current(request.revision)) dispatch({type:'status',status:'error',error:error instanceof Error ? error.message : 'Test data unavailable.'}); }
    finally { window.clearTimeout(timeout); }
  }, []);
  const returnToLoaded = useCallback(() => { requests.current.cancel(); dispatch({ type: 'return-loaded' }); }, []);
  const prepared = useMemo(() => prepareObservations(state.collection.features), [state.collection]);
  const { area, sensor, startDate, endDate, selectedDay } = state.filters;
  const scope = useMemo(() => selectScope(prepared, { area, sensor }), [prepared, area, sensor]);
  const index = useMemo(() => dailyBuckets(scope), [scope]);
  const selected = useMemo(() => selectRange(scope, { startDate, endDate, selectedDay }), [scope, startDate, endDate, selectedDay]);
  const summary = useMemo(() => summarizeRange(selected, state.filters, index, state.collection.metadata), [selected, state.filters, index, state.collection.metadata]);
  return { state, dispatch, retry, uploadCsv, showSimulatedHistory, returnToLoaded, loadTemporary, prepared, scope, index, selected, summary };
}

export type DashboardContextValue = ReturnType<typeof useDashboardValue>;
export function DashboardProvider({ children }: { children: ReactNode }) {
  const value = useDashboardValue();
  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>;
}
export type { DashboardAction, DashboardState };
