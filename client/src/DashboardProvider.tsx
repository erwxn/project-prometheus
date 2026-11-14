import { useArchive } from './useArchive';
import { useCallback, useEffect, useMemo, useReducer, useState, useRef, type ReactNode } from 'react';
import { DashboardContext } from './dashboard-context';
import { API_BASE, FALLBACK_FIRES } from './fire-data';
import { dashboardReducer, initialDashboardState, type DashboardAction, type DashboardState } from './dashboard-state';
import { DatasetRequests, loadObservations, uploadObservations, validateUpload, parseCollection } from './fire-api';
import { dailyBuckets, prepareObservations, selectRange, selectScope, summarizeRange } from './analytics-engine';

function useDashboardValue() {
  const [state, dispatch] = useReducer(dashboardReducer, { type: 'FeatureCollection', features: FALLBACK_FIRES, metadata: { source: 'demo', source_name: 'Undated illustrative demo' } }, initialDashboardState);
  const camera = useRef<{ longitude: number; latitude: number; zoom: number; pitch: number; bearing: number } | null>(null);
  const saveCamera = useCallback((value: NonNullable<typeof camera.current>) => { camera.current = value; }, []);
  const [requests] = useState(() => new DatasetRequests());
  const archive = useArchive(state, dispatch, requests);
  const retry = useCallback(async () => {
    const request = requests.begin();
    dispatch({ type: 'upload', status: 'idle', message: '' });
    dispatch({ type: 'status', status: 'loading' });
    const timeout = window.setTimeout(() => request.controller.abort(), 12000);
    try {
      const collection = await loadObservations(API_BASE, request.controller.signal);
      if (requests.current(request.revision)) dispatch({ type: 'loaded', collection, remember: true });
    } catch (error) {
      if (requests.current(request.revision)) dispatch({ type: 'status', status: 'error', error: error instanceof Error ? error.message : 'The observation API is unavailable.' });
    } finally { window.clearTimeout(timeout); }
  }, [requests]);

  useEffect(() => { void retry(); const gate = requests; return () => gate.cancel(); }, [retry, requests]);
  useEffect(() => {
    if (state.status !== 'error' || state.collection.metadata.uploaded || state.collection.metadata.source === 'simulated' || state.uploadStatus === 'uploading') return;
    const timer = window.setTimeout(() => void retry(), 5000);
    return () => window.clearTimeout(timer);
  }, [retry, state.status, state.collection, state.uploadStatus]);

  const uploadCsv = useCallback(async (file: File) => {
    const error = validateUpload(file);
    if (error) { dispatch({ type: 'upload', status: 'error', message: error }); return; }
    const request = requests.begin();
    const timeout = window.setTimeout(() => request.controller.abort(), 60000);
    dispatch({ type: 'upload', status: 'uploading', message: `Reading ${file.name}…` });
    dispatch({ type: 'status', status: 'ready' });
    try {
      const collection = await uploadObservations(API_BASE, file, request.controller.signal);
      if (!requests.current(request.revision)) return;
      dispatch({ type: 'loaded', collection, remember: true });
      dispatch({ type: 'upload', status: 'done', message: `Loaded ${collection.features.length.toLocaleString()} MODIS detections from ${file.name}.${collection.metadata.rejected_rows ? ` ${collection.metadata.rejected_rows} invalid rows excluded.` : ''}` });
    } catch (error) {
      if (requests.current(request.revision)) dispatch({ type: 'upload', status: 'error', message: `${request.controller.signal.aborted ? 'Upload timed out.' : error instanceof Error ? error.message : 'Upload failed.'} Your current dataset has been kept.` });
    } finally { window.clearTimeout(timeout); }
  }, [requests]);

  const showSimulatedHistory = useCallback(async () => {
    const request = requests.begin();
    dispatch({ type: 'upload', status: 'idle', message: '' });
    try {
      const { simulatedHistory } = await import('./historical-demo');
      if (requests.current(request.revision)) dispatch({ type: 'loaded', collection: simulatedHistory(), remember: false });
    } catch { if (requests.current(request.revision)) dispatch({ type: 'status', status: 'error', error: 'Could not load simulated history. Your current dataset has been kept.' }); }
  }, [requests]);
  const loadTemporary = useCallback(async (platform: string, month: string, page = 0) => {
    const request = requests.begin();
    dispatch({type:'status',status:'loading'});
    const timeout = window.setTimeout(() => request.controller.abort(), 30000);
    try {
      const response = await fetch(`${API_BASE}/api/v1/fires/test?${new URLSearchParams({platform,month,page:String(page)})}`, {signal:request.controller.signal});
      if (!response.ok) throw new Error('Could not load this test-data slice.');
      const collection = parseCollection(await response.json());
      if (requests.current(request.revision)) dispatch({type:'loaded',collection,remember:true});
    } catch (error) { if (requests.current(request.revision)) dispatch({type:'status',status:'error',error:error instanceof Error ? error.message : 'Test data unavailable.'}); }
    finally { window.clearTimeout(timeout); }
  }, [requests]);
  const returnToLoaded = useCallback(() => { requests.cancel(); dispatch({ type: 'return-loaded' }); }, [requests]);
  const prepared = useMemo(() => prepareObservations(state.collection.features), [state.collection]);
  const { area, sensor, startDate, endDate, selectedDay } = state.filters;
  const scope = useMemo(() => selectScope(prepared, { area, sensor }), [prepared, area, sensor]);
  const index = useMemo(() => archive.active ? new Map((archive.data?.daily||[]).map(d=>[d.date,{count:d.count,frpSum:d.frpSum,frpCount:d.frpCount,methodIds:new Set(d.methods)}])) : dailyBuckets(scope), [scope, archive.data, archive.active]);
  const selected = useMemo(() => selectRange(scope, { startDate, endDate, selectedDay }), [scope, startDate, endDate, selectedDay]);
  const localSummary = useMemo(() => summarizeRange(selected, state.filters, index, state.collection.metadata), [selected, state.filters, index, state.collection.metadata]);
  const summary = useMemo(()=>{
    if (!archive.active || !archive.data) return localSummary;
    const days=archive.data.daily.filter(d=>!selectedDay||d.date===selectedDay);
    const count=days.reduce((n,d)=>n+d.count,0),frpCount=days.reduce((n,d)=>n+d.frpCount,0),frpSum=days.reduce((n,d)=>n+d.frpSum,0);
    const values=days.map(d=>state.filters.metric==='detections'?d.count:d.frpCount?d.frpSum/d.frpCount:null).filter((v):v is number=>v!==null);
    const peak=values.length?Math.max(...values):null;
    return {count,activeDays:days.length,meanFrp:frpCount?frpSum/frpCount:null,frpCount,maxFrp:frpCount?Math.max(...days.filter(d=>d.maxFrp!==null).map(d=>d.maxFrp!)):null,peak,peakDays:days.filter(d=>peak!==null&&(state.filters.metric==='detections'?d.count:d.frpCount?d.frpSum/d.frpCount:null)===peak).map(d=>d.date)};
  },[archive.active,archive.data,localSummary,selectedDay,state.filters.metric]);
  return { saveCamera, camera, archive, state, dispatch, retry, uploadCsv, showSimulatedHistory, returnToLoaded, loadTemporary, prepared, scope, index, selected, summary };
}

export type DashboardContextValue = ReturnType<typeof useDashboardValue>;
export function DashboardProvider({ children }: { children: ReactNode }) {
  const value = useDashboardValue();
  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>;
}
export type { DashboardAction, DashboardState };
