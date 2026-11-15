import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import {createGoldReader,publicGoldValue} from '../deploy/backend/gold_reader.mjs';
const require=createRequire(import.meta.url);require('./gold-config').loadGoldLocal();
const base=process.env.PROMETHEUS_CHECK_API_BASE||'http://127.0.0.1:5059';
const report={mode:'live-azure-local-api',azure_writes_performed:false,checked_at_utc:new Date().toISOString(),status:'not-completed'};
const check=(condition)=>{if(!condition)throw Error('Verification failed.');};
async function get(path,status=200){const response=await fetch(base+path,{signal:AbortSignal.timeout(60000)});check(response.status===status);return response.json();}
try{
 const reader=createGoldReader({publication:'algeria'}),access=await reader.checkAccess();
 report.authentication={source:'backend environment/private access file only',method:'read-only container SAS',expires_at_utc:new Date(access.expiry).toISOString()};
 const snapshot=await reader.getSnapshot();const table=await reader.readDataset(snapshot,'algeria_harmonized_predictions');
 check(table.rows.length===7031&&new Set(table.rows.map(row=>row.record_id)).size===7031&&table.rows.every(row=>row.country_iso3==='DZA'&&row.observed_at_utc.startsWith('2015-')));
 report.algeria={snapshot:snapshot.snapshot,committed_sha256_verified:true,files_verified:table.files_verified,rows:table.rows.length};
 let count=0,pages=0;for(let page=1;;page++){
  const body=await get('/api/model-predictions?country=DZA&year=2015&page_size=1000&page='+page+'&snapshot='+snapshot.snapshot);
  check(body.metadata.country_iso3==='DZA'&&body.metadata.dataset==='algeria_harmonized_predictions'&&body.filtered_count===7031&&body.data.every(row=>row.country_iso3==='DZA'&&row.observed_at_utc.startsWith('2015-')));
  count+=body.data.length;pages++;if(page>=body.total_pages)break;check(page<20);
 }
 check(count===7031);report.algeria.pages_verified=pages;
 const day=table.rows[0].observed_at_utc.slice(0,10),expected=table.rows.filter(row=>row.observed_at_utc.startsWith(day)).length;
 const filtered=await get('/api/model-predictions?country=DZA&start_date='+day+'&end_date='+day+'&page_size=1');check(filtered.filtered_count===expected&&filtered.data.length===1);report.filtered_day={day,count:expected};
 check((await get('/api/model-predictions?country=DZA&year=2014')).filtered_count===0);
 check((await get('/api/model-predictions?country=DZA&bbox=-10,20,-9,21')).filtered_count===0);
 await get('/api/model-predictions?country=USA',400);await get('/api/model-predictions?country=DZA&page_size=1001',400);
 await get('/api/model-predictions?country=DZA&snapshot='+'0'.repeat(64),409);
 const morocco=await get('/api/model-predictions?year=2015&page_size=1000');check(morocco.metadata.country_iso3==='MAR'&&morocco.filtered_count===622&&morocco.data.length===622);report.morocco_2015={count:622,snapshot:morocco.metadata.snapshot};
 const defaultMap=await get('/api/gold/explorer');check(defaultMap.metadata.country_iso3==='MAR'&&defaultMap.features.length>0);report.default_morocco_map_records=defaultMap.metadata.total_features;
 const dzaMap=await get('/api/gold/explorer?country=DZA');check(dzaMap.features.length===7031&&dzaMap.features.every(feature=>feature.properties.country_iso3==='DZA'));report.algeria_map_records=dzaMap.features.length;
 const comparison=await get('/api/comparisons/morocco-algeria?year=2015&page_size=1000');
 check(comparison.filtered_count===24&&comparison.data.length===24&&comparison.metadata.shared_acquisitions===20&&comparison.metadata.comparison_status==='DESCRIPTIVE_ONLY_COVERAGE_UNVERIFIED');
 const totals=Object.fromEntries(['MAR','DZA'].map(country=>[country,comparison.data.filter(row=>row.country_iso3===country).reduce((n,row)=>n+row.candidate_cells,0)]));check(totals.MAR===622&&totals.DZA===7031);
 report.comparison={snapshot:comparison.metadata.snapshot,rows:24,totals,shared_acquisitions:20,status:comparison.metadata.comparison_status,pinned_source_catalogs:comparison.metadata.source_catalogs};
 let comparisons=0;for(let page=1;page<=4;page++){const body=await get('/api/comparisons/morocco-algeria?year=2015&page_size=7&page='+page+'&snapshot='+comparison.metadata.snapshot);comparisons+=body.data.length;}check(comparisons===24);
 check((await get('/api/comparisons/morocco-algeria?year=2014')).filtered_count===0);
 report.pagination_filters_empty_errors_and_pinned_comparison='passed';report.status='passed';
}catch{report.status='failed';report.blocker='Live read/API verification failed; raw provider errors and credentials intentionally omitted.';process.exitCode=1;}
await fs.writeFile(new URL('../deploy/evidence/algeria-verification.json',import.meta.url),JSON.stringify(publicGoldValue(report),null,2)+'\n');
console.log(JSON.stringify(publicGoldValue(report),null,2));
