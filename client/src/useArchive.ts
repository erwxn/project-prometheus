import {readArchiveResponse} from './archive-api';
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import type {Dispatch} from 'react';
import {API_BASE} from './fire-data';
import type {DashboardState,DashboardAction} from './dashboard-state';
import type {DatasetRequests} from './fire-api';
import {archiveDefaults,archiveSensor,type ArchiveCatalog,type ArchiveMap,type ArchiveSelection,type ArchiveSummary} from './archive-model';
import type {TrendGrouping} from './historical-chart';
export function useArchive(state:DashboardState,dispatch:Dispatch<DashboardAction>,requests:DatasetRequests,autoArchive=true){
 const [catalog,setCatalog]=useState<ArchiveCatalog|null>(null);
 const [data,setData]=useState<ArchiveSummary|null>(null),[comparison,setComparison]=useState<ArchiveSummary|null>(null);
 const [applyRevision,setApplyRevision]=useState(0);
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const [mapInfo,setMapInfo]=useState<{total:number;nextCursor:number|null;cursor:number}>({total:0,nextCursor:null,cursor:0});
 const [viewport,setViewport]=useState<number[]|null>(null),[cursor,setCursor]=useState(0),[comparisonYears,setComparisonYears]=useState<number[]>([]);
 const [trendGrouping,setTrendGrouping]=useState<TrendGrouping>('monthly');
 const active=state.collection.metadata.archive===true;
 const platform=state.collection.metadata.archive_platform||'Aqua';
 const [mapBusy,setMapBusy]=useState(false);
 const [mapLoading,setMapLoading]=useState(false);
 const mapScope=useRef('');
 const revision=useRef(0),mapRevision=useRef(0);
 useEffect(()=>{const c=new AbortController();fetch(`${API_BASE}/api/v1/fires/test/catalog`,{signal:c.signal}).then(r=>r.ok?r.json():null).then(c=>{if(c?.temporary)setCatalog(c);}).catch(()=>{});return()=>c.abort();},[]);
 const apply=useCallback((selection:ArchiveSelection,reset=false)=>{
 requests.cancel();revision.current++;mapRevision.current++;setApplyRevision(n=>n+1);setBusy(true);setMapBusy(true);setMapLoading(true);setMapInfo({total:0,nextCursor:null,cursor:0});setData(null);setComparison(null);setCursor(0);setViewport(null);setError('');
 const years=[...new Set(catalog?.partitions.filter(p=>p.platform===selection.platform).map(p=>Number(p.month.slice(0,4)))||[])].filter(y=>y<=Number(selection.year)).sort((a,b)=>b-a).slice(0,3);setComparisonYears(years);
 dispatch({type:'archive-apply',selection,sensor:archiveSensor(selection.platform,catalog),reset});
 },[catalog,dispatch,requests]);
 const auto=useRef(false);
 useEffect(()=>{if(autoArchive&&catalog&&!auto.current&&state.collection.metadata.temporary&&!active){auto.current=true;apply(archiveDefaults(catalog,state.collection.metadata.test_platform));}},[autoArchive,catalog,active,apply,state.collection.metadata]);
 // The map page is scoped to the applied range/day and must reset when that scope changes.
 // eslint-disable-next-line react/set-state-in-effect
 useEffect(()=>{setCursor(0);},[state.filters.selectedDay,state.filters.country,state.filters.area,state.filters.startDate,state.filters.endDate]);
 const query=useMemo(()=>({country:state.filters.country,platform,startDate:state.filters.startDate,endDate:state.filters.endDate,area:state.filters.area}),[state.filters.country,platform,state.filters.startDate,state.filters.endDate,state.filters.area]);
 // Loading state synchronizes with the external archive request.
 // eslint-disable-next-line react/set-state-in-effect
 useEffect(()=>{if(!active)return;const c=new AbortController(),rev=++revision.current;setBusy(true);setData(null);setComparison(null);setError('');
 const post=async(kind:string,body:unknown)=>{const r=await fetch(`${API_BASE}/api/v1/fires/archive/${kind}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:c.signal});return readArchiveResponse<ArchiveSummary>(r);};
 Promise.all([post('summary',query),platform==='ALL'||!comparisonYears.length?Promise.resolve(null):post('comparison',{...query,years:comparisonYears})]).then(([summary,history])=>{if(rev===revision.current){setData(summary);setComparison(history);}}).catch(e=>{if(!c.signal.aborted&&rev===revision.current){setData(null);setComparison(null);setError(e.message);}}).finally(()=>{if(rev===revision.current)setBusy(false);});return()=>c.abort();
 },[active,query,comparisonYears,platform,applyRevision]);
 // Loading state synchronizes with the external archive request.
 // eslint-disable-next-line react/set-state-in-effect
 useEffect(()=>{if(!active)return;const scopeKey=JSON.stringify([query,cursor,state.filters.selectedDay,applyRevision]);if(mapScope.current!==scopeKey){mapScope.current=scopeKey;setMapLoading(true);}const c=new AbortController(),rev=++mapRevision.current;setMapBusy(true);const timer=window.setTimeout(()=>{
 fetch(`${API_BASE}/api/v1/fires/archive/observations`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...query,viewport,cursor,selectedDay:state.filters.selectedDay}),signal:c.signal}).then(r=>readArchiveResponse<ArchiveMap>(r)).then(d=>{if(rev===mapRevision.current){dispatch({type:'archive-map',collection:d});setMapInfo({total:d.total,nextCursor:d.nextCursor,cursor});}}).catch(e=>{if(!c.signal.aborted&&rev===mapRevision.current)setError(e.message);}).finally(()=>{if(rev===mapRevision.current){setMapBusy(false);setMapLoading(false);}});},250);return()=>{clearTimeout(timer);c.abort();};
 },[active,query,viewport,cursor,state.filters.selectedDay,dispatch,applyRevision]);
 const updateViewport=useCallback((bounds:number[])=>{setViewport(old=>JSON.stringify(old)===JSON.stringify(bounds)?old:bounds);setCursor(0);},[]);
 const changeYear=useCallback((year:string)=>{if(!catalog)return;apply({...archiveDefaults(catalog,platform),platform,year,startDate:`${year}-01-01`,endDate:`${year}-12-31`});},[catalog,platform,apply]);
 return {active,catalog,apply,data:active?data:null,comparison:active?comparison:null,busy:active&&busy,mapBusy:active&&mapBusy,mapLoading:active&&mapLoading,error:active?error:'',platform,mapInfo,cursor,setCursor,updateViewport,comparisonYears,setComparisonYears,trendGrouping,setTrendGrouping,changeYear};
}
