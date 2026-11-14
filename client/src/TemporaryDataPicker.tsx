import {useState} from 'react';
import {useDashboard} from './dashboard-context';
import {archiveDefaults,type ArchiveSelection} from './archive-model';
import {dateRangeError} from './analytics-engine';
const names:Record<string,string>={Terra:'MODIS — Terra',Aqua:'MODIS — Aqua',SNPP:'VIIRS — Suomi NPP',N20:'VIIRS — NOAA-20',N21:'VIIRS — NOAA-21',ALL:'All available satellites · overview'};
export function TemporaryDataPicker(){
 const {archive,state,selected}=useDashboard();const c=archive.catalog;
 const [draft,setDraft]=useState<ArchiveSelection|null>(null),[error,setError]=useState('');
 const [exporting,setExporting]=useState(false),[exportMessage,setExportMessage]=useState('');
 const exportPdf=async()=>{
  if(!archive.data)return;
  setExporting(true);setExportMessage('Preparing archive PDF...');
  try {
   const {archivePdf}=await import('./archive-pdf');
   const pdf=archivePdf(archive.data,archive.comparison,{platform:archive.platform,startDate:state.filters.startDate,endDate:state.filters.endDate,area:state.filters.area});
   const url=URL.createObjectURL(pdf.output('blob'));
   const link=document.createElement('a');link.href=url;link.download='prometheus-archive-report.pdf';document.body.appendChild(link);link.click();link.remove();
   window.setTimeout(()=>URL.revokeObjectURL(url),60000);setExportMessage('Archive PDF download started.');
  } catch {setExportMessage('Could not create the archive PDF. Please try again.');}
  finally {setExporting(false);}
 };
 const key=`${state.collection.metadata.archive_platform}|${state.filters.startDate}|${state.filters.endDate}`;
 const [previousKey,setPreviousKey]=useState('');
 const draftKey=`${key}|${archive.active}|${c?.total}`;
 if(c && previousKey!==draftKey){setPreviousKey(draftKey);setDraft(archive.active?{platform:archive.platform,year:state.collection.metadata.archive_year||state.filters.startDate.slice(0,4),month:state.collection.metadata.archive_month||'ALL',startDate:state.filters.startDate,endDate:state.filters.endDate}:archiveDefaults(c,state.collection.metadata.test_platform));}

 if(!c||!draft)return null;
 const available=c.partitions.filter(p=>draft.platform==='ALL'||p.platform===draft.platform),years=[...new Set(available.map(p=>p.month.slice(0,4)))].sort().reverse();
 const months=new Set(available.filter(p=>p.month.startsWith(draft.year)).map(p=>p.month.slice(5)));
 const setPeriod=(year:string,month:string)=>setDraft({...draft,year,month,startDate:`${year}-${month==='ALL'?'01':month}-01`,endDate:month==='ALL'?`${year}-12-31`:new Date(Date.UTC(Number(year),Number(month),0)).toISOString().slice(0,10)});
 const totals=archive.data?.totals;
 return <section className="temporary-data-picker" aria-labelledby="archive-title" aria-busy={archive.busy}>
 <h2 id="archive-title">Historical Fire Archive Explorer</h2><p>{c.total.toLocaleString()} unique observations indexed locally. Raw NASA FIRMS records for temporary testing; satellite coverage is unknown. Original ZIP files remain unchanged.</p>
 <form className="archive-toolbar" onSubmit={e=>{e.preventDefault();const message=dateRangeError(draft.startDate,draft.endDate);if(message){setError(message);return;}setError('');archive.apply(draft);}}>
 <label>Satellite<select value={draft.platform} onChange={e=>{const platform=e.target.value;const next=archiveDefaults(c,platform==='ALL'?undefined:platform);setDraft({...next,platform});}}>{[...new Set(c.partitions.map(p=>p.platform))].map(p=><option key={p} value={p}>{names[p]||p}</option>)}<option value="ALL">{names.ALL}</option></select></label>
 <label>Year<select value={draft.year} onChange={e=>setPeriod(e.target.value,'ALL')}>{years.map(y=><option key={y}>{y}</option>)}</select></label>
 <label>Month<select value={draft.month} onChange={e=>setPeriod(draft.year,e.target.value)}><option value="ALL">All available months</option>{Array.from({length:12},(_,i)=>String(i+1).padStart(2,'0')).map(m=><option key={m} value={m} disabled={!months.has(m)}>{new Date(`2000-${m}-01T00:00:00Z`).toLocaleString('en',{month:'long',timeZone:'UTC'})}{months.has(m)?'':' · no indexed records'}</option>)}</select></label>
 <label>Start date (UTC)<input type="date" required value={draft.startDate} onChange={e=>setDraft({...draft,startDate:e.target.value})}/></label><label>End date (UTC)<input type="date" required value={draft.endDate} onChange={e=>setDraft({...draft,endDate:e.target.value})}/></label>
 <button>Apply Filters</button><button type="button" onClick={()=>{const next=archiveDefaults(c);setDraft(next);setError('');archive.apply(next,true);}}>Reset Filters</button>
 </form>
 {error&&<p role="alert">{error}</p>}{archive.error&&<p role="alert" className="dashboard-error">{archive.error} <button onClick={()=>archive.apply(draft)}>Retry archive</button></p>}
 {archive.active&&<div className="archive-summary" role="status"><strong>{names[archive.platform]||archive.platform} · {state.filters.startDate} – {state.filters.endDate} UTC</strong>
 <p>{archive.busy?'Calculating the entire selection…':totals?`${totals.count.toLocaleString()} indexed matches · ${archive.data!.daily.length} observed active days · mean FRP ${totals.frpCount?(totals.frpSum/totals.frpCount).toFixed(2)+' MW':'unavailable'} (${totals.frpCount.toLocaleString()} readings)`:'No aggregate result available.'}</p>
 <p>{totals?.first?`Recorded observation bounds: ${totals.first.slice(0,10)} – ${totals.last?.slice(0,10)}. These are not coverage guarantees.`:archive.busy?'Recorded observation bounds pending.':'No recorded observations in the selected scope.'}</p>
 <p>{archive.mapBusy?'Loading map observations…':`${state.collection.features.length.toLocaleString()} loaded map records · ${selected.length.toLocaleString()} displayed by shared filters · ${archive.mapInfo.total.toLocaleString()} map matches in the current viewport/day.`} Statistics use the entire applied selection, independently of map pagination. Explorer playback uses loaded points only.</p>
 <div className="control-actions"><button disabled={!archive.data||archive.busy||exporting} onClick={()=>void exportPdf()}>{exporting?'Preparing PDF...':'Export aggregate PDF'}</button><button disabled={!archive.cursor||archive.mapBusy} onClick={()=>archive.setCursor(Math.max(0,archive.cursor-10000))}>Previous map page</button><button disabled={archive.mapInfo.nextCursor===null||archive.mapBusy} onClick={()=>archive.setCursor(archive.mapInfo.nextCursor!)}>Next map page</button></div>
 {exportMessage&&<p role="status">{exportMessage}</p>}
 </div>}
 <small>No harmonized predictions or complete-coverage guarantees are supplied. Missing records are not zero activity.</small>
 </section>;
}
