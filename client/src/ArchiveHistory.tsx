import {useMemo,useState} from 'react';
import {useDashboard} from './dashboard-context';
import {ActivityLineChart} from './ActivityLineChart';
import {enumerateDates} from './analytics-engine';
import {metricUnit,type TrendPoint} from './analytics-model';
import type {ArchiveBucket} from './archive-model';
const months=Array.from({length:12},(_,i)=>String(i+1).padStart(2,'0'));
const colors=['#365f76','#8b4f76','#277569','#9a641d','#5151a3'];
const dash=['','7 4','2 4','10 3 2 3'];
export function ArchiveHistory(){
 const {archive,state}=useDashboard();const [grain,setGrain]=useState<'month'|'year'>('month');
 const metric=state.filters.metric,unit=metricUnit(metric);
 const value=(b:ArchiveBucket|undefined)=>!b?null:metric==='detections'?b.count:b.frpCount?b.frpSum/b.frpCount:null;
 const years=useMemo(()=>[...new Set(archive.catalog?.partitions.filter(p=>p.platform===archive.platform).map(p=>Number(p.month.slice(0,4)))||[])].sort((a,b)=>b-a),[archive.catalog,archive.platform]);
 const data=archive.data,history=archive.comparison;
 const methods=new Set(history?.daily.flatMap(d=>d.methods)||[]);
 const comparable=methods.size===1&&![...methods].some(m=>m.endsWith('/unknown'));
 const buckets=grain==='month'?data?.monthly:data?.yearly;
 const points:TrendPoint[]=[...new Set(enumerateDates(state.filters.startDate,state.filters.endDate).map(d=>d.slice(0,grain==='month'?7:4)))].map(date=>{const d=buckets?.find(b=>b.date===date);return {date,count:d?.count||0,value:value(d),complete:false,baseline:null,absoluteAnomaly:null,percentageAnomaly:null,baselineReason:data?.baselineReason||'Coverage unknown'};});
 const dailyLabels=enumerateDates('2000-01-01','2000-12-31').map(d=>d.slice(5));
 const comparisonSeries=(daily:boolean)=>archive.comparisonYears.map((year,i)=>({id:String(year),label:String(year),color:colors[i%colors.length],dash:dash[i%dash.length],values:(daily?dailyLabels:months).map(key=>value((daily?history?.daily:history?.monthly)?.find(b=>b.date===`${year}-${key}`))),complete:(daily?dailyLabels:months).map(()=>false)}));
 return <section className="dashboard-section historical-activity" aria-labelledby="history-title"><div className="section-toolbar"><div><h2 id="history-title">Historical fire comparison</h2><p>Recorded raw observations for {archive.platform}, within the selected geographic area. Missing dates remain gaps.</p></div><label>Trend grouping<select value={grain} onChange={e=>setGrain(e.target.value as typeof grain)}><option value="month">Monthly</option><option value="year">Yearly</option></select></label></div>
 {archive.busy&&<p role="status">Loading full-selection historical aggregates…</p>}
 <ActivityLineChart title="Selected-period activity trend" labels={points.map(p=>p.date)} series={[{id:'observed',label:archive.platform,values:points.map(p=>p.value),color:colors[0],complete:points.map(()=>false)}]} unit={unit} selectedIndex={state.filters.selectedDay?points.findIndex(p=>p.date===state.filters.selectedDay!.slice(0,grain==='month'?7:4)):-1}/>
 {archive.platform==='ALL'?<p>Choose one satellite/product for historical comparisons. Mixed satellite counts are descriptive only.</p>:<>
 <fieldset className="year-toggles"><legend>Compare available years (up to 10)</legend>{years.map(y=><label key={y}><input type="checkbox" checked={archive.comparisonYears.includes(y)} disabled={!archive.comparisonYears.includes(y)&&archive.comparisonYears.length>=10} onChange={e=>archive.setComparisonYears(old=>e.target.checked?[...old,y].sort():old.filter(v=>v!==y))}/>{y}</label>)}</fieldset>
 {!comparable?<p className="dashboard-unavailable">Comparison unavailable: select years containing one consistent, known product/version. Mixed versions or absent method evidence cannot establish comparability.</p>:<><ActivityLineChart title="Year-over-year monthly recorded activity" labels={months} series={comparisonSeries(false)} unit={unit} selectedIndex={state.filters.selectedDay?Number(state.filters.selectedDay.slice(5,7))-1:-1}/><ActivityLineChart title="Year-over-year daily recorded activity" labels={dailyLabels} series={comparisonSeries(true)} unit={unit} selectedIndex={state.filters.selectedDay?dailyLabels.indexOf(state.filters.selectedDay.slice(5)):-1}/></>}
 </>}
 <h3>Historical baseline and anomalies</h3><p className="dashboard-unavailable">{data?.baselineReason||'Satellite coverage is not established by this archive; baseline and anomalies are unavailable.'}</p>
 <div className="analytics-table-scroll"><table className="analytics-table"><caption>Exact selected-period observations · incomplete or unknown coverage</caption><thead><tr><th>Period</th><th>Detections</th><th>Mean FRP (MW)</th><th>Baseline / anomaly</th></tr></thead><tbody>{(grain==='month'?data?.monthly:data?.yearly)?.map(d=><tr key={d.date}><th>{d.date}</th><td>{d.count.toLocaleString()}</td><td>{d.frpCount?(d.frpSum/d.frpCount).toFixed(3):'Unavailable'}</td><td>Unavailable · coverage unknown</td></tr>)}</tbody></table></div>
 <p className="scientific-note">Hollow points indicate incomplete or unknown coverage. Comparisons describe recorded activity, without correcting for coverage or sensor sensitivity. February 29 is absent in non-leap years.</p>
 </section>;
}
