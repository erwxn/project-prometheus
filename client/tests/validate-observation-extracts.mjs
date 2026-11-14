import {readFile,readdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {performance} from 'node:perf_hooks';
import {prepareObservations,selectScope,selectRange,dailyBuckets,summarizeRange,activityDay,historicalTrends} from '../src/analytics-engine.ts';
const require=createRequire(import.meta.url);const {parseModisCsv}=require('../../server/modis-csv.js');
const directory=path.resolve(process.argv[2]||'server/data/analytics-validation');
const files=(await readdir(directory)).filter(f=>f.endsWith('-expected.json'));assert.ok(files.length,'Run the archive audit first');
const results=[];
for(const file of files){
 const start=performance.now();const input=JSON.parse(await readFile(path.join(directory,file),'utf8'));const e=input.expected;
 const collection=input.sensor==='MODIS'?parseModisCsv(await readFile(input.csv,'utf8'),path.basename(input.csv)):{type:'FeatureCollection',metadata:{source:'csv',source_name:path.basename(input.csv)},features:input.rows.map(r=>({type:'Feature',geometry:{type:'Point',coordinates:[r.lng,r.lat]},properties:{satellite:'VIIRS',platform:r.platform,raw_frp:r.frp,normalized_frp:null,observed_at_utc:`${r.date}T${r.time}:00Z`,acq_time_utc:r.time,local_solar_time:r.time,confidence:'unclassified'}}))};
 const dates=input.rows.map(r=>r.date).sort();const filters={area:null,startDate:dates[0],endDate:dates.at(-1),sensor:input.sensor,metric:'detections',selectedDay:null};
 const prepared=prepareObservations(collection.features);const scope=selectScope(prepared,filters);const index=dailyBuckets(scope);const selected=selectRange(scope,filters);const stats=summarizeRange(selected,filters,index,collection.metadata);
 assert.equal(stats.count,e.count);assert.equal(stats.activeDays,e.activeDays);assert.ok(Math.abs(stats.meanFrp-e.meanFrp)<1e-8);
 for(const [date,count] of Object.entries(e.daily))assert.equal(activityDay(date,index,collection.metadata,filters.sensor,'detections').count,count);
 const trends=historicalTrends(index,collection.metadata,filters,'month');for(const p of trends){assert.equal(p.count,e.monthly[p.date]||0);assert.equal(p.baseline,null);assert.equal(p.percentageAnomaly,null);}
 const area={type:'Feature',geometry:{type:'Polygon',coordinates:[[[-10,30],[15,45],[40,25],[-10,30]]]},properties:{kind:'polygon'}};
 const regional=selectScope(prepared,{...filters,area});assert.equal(regional.length,e.polygonCount);
 if(regional.length)assert.ok(Math.abs(regional.reduce((s,r)=>s+r.frp,0)/regional.length-e.polygonMeanFrp)<1e-8);
 const day=Object.keys(e.daily)[0];assert.equal(selectRange(scope,{...filters,selectedDay:day}).length,e.daily[day]);
 assert.equal(selectScope(prepared,{...filters,sensor:input.sensor==='MODIS'?'VIIRS':'MODIS'}).length,0);
 results.push({file,source:input.archive,sensor:input.sensor,records:e.count,activeDays:e.activeDays,meanFrp:stats.meanFrp,polygonCount:regional.length,monthsChecked:trends.length,baseline:'correctly unavailable',milliseconds:Math.round(performance.now()-start),result:'PASS',ingestion:input.sensor==='MODIS'?'existing MODIS importer':'test-only normalization; VIIRS upload not supported'});
}
await writeFile(path.join(directory,'analytics-results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));console.log(`${results.length} real-data extracts passed independent reference checks.`);
