import {useMemo} from 'react';
import {useDashboard} from './dashboard-context';
import {selectRange,activityDay,enumerateDates} from './analytics-engine';
import {seasonalCells,type MonthInput} from './seasonal-heatmap';

/** Shows descriptive month-by-year activity without asserting validated cross-sensor comparability. */
export function SeasonalHeatmap(){
 const {archive,state,scope,index}=useDashboard();
 const months=useMemo(()=>{
  if(archive.active)return archive.data?.monthly||[];
  const buckets=new Map<string,MonthInput>();
  for(const row of selectRange(scope,{...state.filters,selectedDay:null})){
   if(!row.date)continue;const key=row.date.slice(0,7),b=buckets.get(key)||{date:key,count:0,frpSum:0,frpCount:0};b.count++;if(row.frp!==null){b.frpSum+=row.frp;b.frpCount++;}buckets.set(key,b);
  }
  // Complete coverage can establish a real zero; missing detection records alone cannot.
  const dates=enumerateDates(state.filters.startDate,state.filters.endDate);
  const coverage=new Map<string,boolean>();
  for(const date of dates){const key=date.slice(0,7),complete=activityDay(date,index,state.collection.metadata,state.filters.sensor,'detections').availability==='complete';coverage.set(key,(coverage.get(key)??true)&&complete);}
  for(const [key,complete] of coverage){if(complete){const b=buckets.get(key)||{date:key,count:0,frpSum:0,frpCount:0};b.complete=true;buckets.set(key,b);}}
  return [...buckets.values()];
 },[archive.active,archive.data,scope,state.filters,index,state.collection.metadata]);
 const rows=seasonalCells(months,state.filters.startDate,state.filters.endDate,state.filters.metric);
 const maximum=Math.max(0,...rows.flat().map(c=>c.value??0));
 const label=state.filters.metric==='detections'?(!archive.active && state.collection.metadata.record_unit==='model_candidate'?'Model candidate cells':!archive.active && state.collection.metadata.record_unit==='predicted_cell'?'Predicted cells':!archive.active && state.collection.metadata.record_unit==='fire_group'?'Fire groups':'Recorded detections'):'Mean FRP (MW)';
 return <section className="dashboard-section seasonal-section" aria-labelledby="seasonal-title"><h2 id="seasonal-title">Burning activity by month and year</h2><p>Compare seasonal patterns using one color scale across the entire selection. {archive.active||state.collection.metadata.source!=='harmonized'?'Raw or test observations; cross-sensor comparability is not established.':'Harmonized input; activity-count comparability awaits validation by the data team.'}</p>
 {archive.busy?<p role="status">Loading monthly activity…</p>:!rows.length?<p>Choose a dated dataset and period to view monthly activity.</p>:<div className="seasonal-scroll" tabIndex={0} role="region" aria-label="Monthly activity table"><table className="seasonal-table"><caption>{label} · selected region and UTC period · colors show relative magnitude</caption><thead><tr><th scope="col">Year</th>{Array.from({length:12},(_,i)=><th scope="col" key={i}>{new Date(Date.UTC(2000,i,1)).toLocaleString('en',{month:'short',timeZone:'UTC'})}</th>)}</tr></thead><tbody>{rows.map(row=><tr key={row[0].date}><th scope="row">{row[0].date.slice(0,4)}</th>{row.map(c=><td key={c.date} data-level={c.level} className={c.outside?'outside':c.value===null?'unknown':''} title={`${c.date}: ${c.outside?'outside selection':c.value===null?'unknown / no usable data':`${c.value.toLocaleString(undefined,{maximumFractionDigits:2})} ${label}; ${c.complete?'coverage known':'coverage incomplete or unknown'}`}`}>{c.outside?'—':c.value===null?'?':c.value.toLocaleString(undefined,{maximumFractionDigits:1})}{c.value!==null&&!c.complete&&<span aria-label="coverage incomplete or unknown">*</span>}</td>)}</tr>)}</tbody></table></div>}
 <div className="calendar-legend" aria-label="Monthly activity color scale"><span>0</span>{[1,2,3,4].map(level=><span key={level}><i data-level={level} />Up to {(maximum*level/4).toLocaleString(undefined,{maximumFractionDigits:1})}{state.filters.metric==='mean-frp'?' MW':' detections'}</span>)}</div>
 <p className="scientific-note">? = unknown or no usable data; — = outside selection; * = incomplete or unknown coverage. Zero is shown only for supplied zero values or known coverage. These values describe the selected period, not validated anomalies.</p>
 </section>;
}
