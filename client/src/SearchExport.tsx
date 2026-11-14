import {useState} from 'react';
import {useDashboard} from './dashboard-context';
import {API_BASE} from './fire-data';
import {snapshotCsv} from './search-csv';
import {selectRange} from './analytics-engine';

/** Analyze owns machine-readable full-search exports; map paging is excluded. */
export function SearchExport(){
 const {state,archive,scope}=useDashboard();
 const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
 async function download(){
  setBusy(true);setMessage('Preparing all matching search records…');
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),120000);
  try{
   let blob:Blob,count:number;
   if(archive.active){
    const response=await fetch(`${API_BASE}/api/v1/history/export.csv`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...state.filters,source:'archive',platform:archive.platform,cursor:0,expectedVersion:archive.data?.metadata?.version}),signal:controller.signal});
    if(!response.ok){const data=await response.json().catch(()=>null);throw Error(data?.error||`CSV export failed (HTTP ${response.status}).`);}
    if(!response.headers.get('content-type')?.includes('text/csv'))throw Error('CSV endpoint unavailable. Restart the API after pulling updates.');
    blob=await response.blob();count=Number(response.headers.get('X-Export-Rows'));
   }else{
    const features=selectRange(scope,state.filters).map(row=>row.feature);count=features.length;
    const version=state.collection.metadata.version||'unversioned-loaded-snapshot';
    blob=new Blob([snapshotCsv(features,state.collection.metadata.source_name||state.collection.metadata.source,version)],{type:'text/csv;charset=utf-8'});
   }
   const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='prometheus-search.csv';document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
   setMessage(`CSV download started: ${count.toLocaleString()} matching records.`);
  }catch(error){setMessage(controller.signal.aborted?'Export timed out. Try a smaller region or period.':error instanceof Error?error.message:'CSV export failed.');}
  finally{clearTimeout(timeout);setBusy(false);}
 }
 return <section className="search-export" aria-label="Search downloads"><div><strong>Download this search</strong><p>{archive.active?'All matching archive records, across every map page.':'All matching records in the loaded snapshot.'} {state.filters.selectedDay?`Focused on ${state.filters.selectedDay} UTC.`:'Uses the selected UTC dates, region and source.'}</p></div><button disabled={busy||state.status==='loading'||archive.busy} onClick={()=>void download()}>{busy?'Preparing CSV…':'Download search CSV'}</button>{message&&<p role="status">{message}</p>}</section>;
}
