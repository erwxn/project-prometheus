import {useEffect,useRef,useState} from 'react';
import {API_BASE} from './fire-data';
import {ActivityLineChart} from './ActivityLineChart';

type ComparisonRow={country_iso3:'MAR'|'DZA';year:number;month:number;candidate_cells:number;comparison_status:string};
type ComparisonData={metadata:{comparison_status:string;shared_acquisitions:number;source_catalogs:{country_iso3:string;catalog_sha256:string;catalog_path:string}[]};data:ComparisonRow[];filtered_count:number;total_pages:number};

/** Displays committed descriptive counts with their pinned source versions and unknown coverage. */
export function GoldCountryComparison(){
 const [result,setResult]=useState<ComparisonData|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const pending=useRef<AbortController|null>(null);
 useEffect(()=>()=>pending.current?.abort(),[]);
 async function compare(){
  if(pending.current)return;
  const controller=new AbortController();pending.current=controller;setBusy(true);setError('');
  const timeout=window.setTimeout(()=>controller.abort(),60000);
  try{
   const response=await fetch(API_BASE+'/api/comparisons/morocco-algeria?year=2015&page_size=1000',{signal:controller.signal,cache:'no-store'});
   if(!response.ok)throw Error('The committed comparison could not be loaded (HTTP '+response.status+').');
   const body=await response.json() as ComparisonData;
   if(body.metadata?.comparison_status!=='DESCRIPTIVE_ONLY_COVERAGE_UNVERIFIED'||!Array.isArray(body.metadata.source_catalogs)||body.metadata.source_catalogs.length!==2||new Set(body.metadata.source_catalogs.map(source=>source.country_iso3)).size!==2||body.metadata.source_catalogs.some(source=>!['MAR','DZA'].includes(source.country_iso3)||!/^[a-f0-9]{64}$/.test(source.catalog_sha256))||!Number.isSafeInteger(body.metadata.shared_acquisitions)||body.metadata.shared_acquisitions<0||!Array.isArray(body.data)||body.filtered_count!==24||body.data.length!==24||new Set(body.data.map(row=>row.country_iso3+':'+row.month)).size!==24||body.total_pages>1||body.data.some(row=>!['MAR','DZA'].includes(row.country_iso3)||row.year!==2015||!Number.isInteger(row.month)||row.month<1||row.month>12||!Number.isSafeInteger(row.candidate_cells)||row.candidate_cells<0||row.comparison_status!==body.metadata.comparison_status))throw Error('Invalid committed comparison response.');
   setResult(body);
  }catch(reason){if(!controller.signal.aborted)setError(reason instanceof Error?reason.message:'Comparison unavailable.');else if(pending.current===controller)setError('Comparison timed out. Retry.');}
  finally{window.clearTimeout(timeout);if(pending.current===controller){pending.current=null;setBusy(false);}}
 }
 const months=Array.from({length:12},(_,i)=>'2015-'+String(i+1).padStart(2,'0'));
 const count=(country:string)=>result?.data.filter(row=>row.country_iso3===country).reduce((sum,row)=>sum+row.candidate_cells,0);
 return <section className="dashboard-section place-comparison" aria-labelledby="places-title">
  <div className="section-toolbar"><div><h2 id="places-title">Morocco and Algeria - 2015</h2><p>Compare the committed Model B candidate populations over the same year.</p></div><div className="inline-controls place-comparison-form"><button disabled={busy} onClick={()=>void compare()}>{busy?'Loading committed comparison...':result?'Refresh comparison':'Load 2015 comparison'}</button></div></div>
  <p className="scientific-note">Uncalibrated model scores, not confirmed fires or calibrated probabilities. Coverage is unknown. Counts do not establish national fire rates or independent accuracy.</p>
  {error&&<p role="alert">{error}</p>}
  {result&&<>
   <dl className="analytics-metrics"><div><dt>Morocco scored candidate cells</dt><dd>{count('MAR')?.toLocaleString()}</dd></div><div><dt>Algeria scored candidate cells</dt><dd>{count('DZA')?.toLocaleString()}</dd></div><div><dt>Shared acquisitions</dt><dd>{result.metadata.shared_acquisitions}</dd></div></dl>
   <ActivityLineChart title="Monthly scored candidate cells - 2015" labels={months} unit="scored candidate cells" xAxisLabel="UTC month" series={(['MAR','DZA'] as const).map((country,i)=>({id:country,label:country==='MAR'?'Morocco':'Algeria',color:i?'var(--chart-4, #9a641d)':'var(--chart-1, #365f76)',dash:i?'6 4':undefined,values:months.map((_,month)=>result.data.find(row=>row.country_iso3===country&&row.month===month+1)?.candidate_cells??null),complete:months.map(()=>false)}))}/>
   <p className="scientific-note">{result.metadata.comparison_status}. A supplied zero means no exported candidates, not no fires. Both source catalog versions remain pinned by this comparison.</p>
   <details><summary>Pinned source catalog versions</summary><ul>{result.metadata.source_catalogs.map(source=><li key={source.country_iso3}>{source.country_iso3}: <code>{source.catalog_sha256}</code></li>)}</ul></details>
  </>}
 </section>;
}
