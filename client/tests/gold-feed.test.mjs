import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadObservations} from '../src/fire-api.ts';
import {emptyGoldCollection} from '../src/gold-feed.ts';
import {initialDashboardState} from '../src/dashboard-state.ts';
const hash='a'.repeat(64);
function page(number=1, totalPages=1, total=1, sensor='Harmonized') {
 return {type:'FeatureCollection',metadata:{gold:true,source:'harmonized',country_iso3:'MAR',gold_sensor:sensor,gold_snapshot:hash,gold_page:number,gold_pages:totalPages,total_features:total,version:`${hash}:${sensor}`},features:[{type:'Feature',id:`row-${number}`,geometry:{type:'Point',coordinates:[-5,34]},properties:{satellite:sensor,country_iso3:'MAR',raw_frp:null,normalized_frp:null,observed_at_utc:'2025-01-01T12:00:00Z'}}]};
}
test('startup is an empty Morocco dataset, never worldwide fallback fires',()=>{
 const collection=emptyGoldCollection(), state=initialDashboardState(collection);
 assert.equal(collection.features.length,0);assert.equal(collection.metadata.gold,true);assert.equal(state.filters.sensor,'Harmonized');assert.equal(state.status,'loading');
});
test('frontend fetches Gold and publishes all same-snapshot pages atomically',async()=>{
 const calls=[];
 const result=await loadObservations('',new AbortController().signal,async url=>{
  calls.push(url);const query=new URL(url,'http://localhost').searchParams;
  return new Response(JSON.stringify(page(Number(query.get('page')),2,2)));
 });
 assert.equal(result.features.length,2);assert.match(calls[0],/^\/api\/gold\/explorer/);assert.match(calls[1],/snapshot=aaaa/);
});
test('demo responses, wrong countries, 2026 and mixed snapshots are rejected without a legacy fallback',async()=>{
 for(const change of [data=>{data.metadata.gold=false;},data=>{data.features[0].properties.country_iso3='USA';},data=>{data.features[0].properties.observed_at_utc='2026-01-01T12:00:00Z';}]){
  let calls=0;const data=page();change(data);
  await assert.rejects(loadObservations('',new AbortController().signal,async()=>{calls++;return new Response(JSON.stringify(data));}));assert.equal(calls,1);
 }
 let count=0;
 await assert.rejects(loadObservations('',new AbortController().signal,async()=>{const data=page(++count,2,2);if(count===2)data.metadata.gold_snapshot='b'.repeat(64);return new Response(JSON.stringify(data));}));
});
test('source switches request the chosen Gold sensor and incomplete downloads fail',async()=>{
 let requested;
 const next=await loadObservations('',new AbortController().signal,async url=>{requested=url;return new Response(JSON.stringify(page(1,1,1,'VIIRS')));},'VIIRS');
 assert.match(requested,/sensor=VIIRS/);assert.equal(next.features.length,1);
 await assert.rejects(loadObservations('',new AbortController().signal,async()=>new Response(JSON.stringify(page(1,1,2)))),/incomplete/);
});
test('unchanged Gold polling keeps the loaded objects and failures never load sample data',async()=>{
 const previous=page();let headers;
 const same=await loadObservations('',new AbortController().signal,async(_,options)=>{headers=options.headers;return new Response(null,{status:304});},'Harmonized',previous);
 assert.equal(same,previous);assert.equal(headers['If-None-Match'],`"${hash}:Harmonized:1"`);
 let calls=0;await assert.rejects(loadObservations('',new AbortController().signal,async()=>{calls++;return new Response(null,{status:503});}),/Morocco Gold/);assert.equal(calls,1);
});
import {readFileSync} from 'node:fs';
import {prepareObservations,selectScope} from '../src/analytics-engine.ts';

const algeriaCatalog=JSON.parse(readFileSync(new URL('../../server/fixtures/gold-catalog/algeria/catalog.json',import.meta.url)));
const actualRows=algeriaCatalog.datasets.algeria_harmonized_predictions.files.flatMap(file=>file.example_rows||[]);
const dzaHash='94526b239758bb3aed2eb75ae9730ecdadd6da3edef010c6d2fa4c67700723ee';
function algeriaResponse(page=1){return {metadata:{country_iso3:'DZA',dataset:'algeria_harmonized_predictions',snapshot:dzaHash},page,filtered_count:2,total_pages:2,data:[actualRows[page-1]]};}

test('Algeria selection uses the predictions API and loads all pinned pages before publishing',async()=>{
 const calls=[];
 const collection=await loadObservations('',new AbortController().signal,async url=>{
  calls.push(url);const query=new URL(url,'http://localhost').searchParams;
  assert.equal(query.get('country'),'DZA');assert.equal(query.get('year'),'2015');
  if(calls.length===2)assert.equal(query.get('snapshot'),dzaHash);
  return new Response(JSON.stringify(algeriaResponse(Number(query.get('page')))));
 },'Harmonized',undefined,'DZA');
 assert.equal(calls.length,2);assert.match(calls[0],/^\/api\/model-predictions/);assert.equal(collection.metadata.country_iso3,'DZA');
 assert.equal(collection.features.length,2);assert.ok(collection.features.every(f=>f.properties.gold_verified&&f.properties.raw_frp===null&&f.properties.record_unit==='model_candidate'));
 const filters={sensor:'Harmonized',country:'DZA',area:null};
 assert.equal(selectScope(prepareObservations(collection.features),filters).length,2);
 assert.equal(selectScope(prepareObservations(collection.features),{...filters,country:'MAR'}).length,0);
});

test('Algeria fails atomically for wrong-country, mixed-snapshot, missing-page and server errors',async()=>{
 for(const change of [body=>{body.data[0].country_iso3='MAR';},body=>{body.metadata.country_iso3='MAR';},body=>{body.data=[];}]){
  await assert.rejects(loadObservations('',new AbortController().signal,async()=>{const body=structuredClone(algeriaResponse());change(body);return new Response(JSON.stringify(body));},'Harmonized',undefined,'DZA'));
 }
 let page=0;await assert.rejects(loadObservations('',new AbortController().signal,async()=>{const body=algeriaResponse(++page);if(page===2)body.metadata.snapshot='a'.repeat(64);return new Response(JSON.stringify(body));},'Harmonized',undefined,'DZA'));
 let calls=0;await assert.rejects(loadObservations('',new AbortController().signal,async()=>{calls++;return new Response('{}',{status:503});},'Harmonized',undefined,'DZA'));assert.equal(calls,1);
});

test('unchanged Algeria refresh is one authenticated conditional request, not eight downloaded pages',async()=>{
 const previous=await loadObservations('',new AbortController().signal,async url=>new Response(JSON.stringify(algeriaResponse(Number(new URL(url,'http://localhost').searchParams.get('page')))),{headers:{ETag:'"verified-algeria-page"'}}),'Harmonized',undefined,'DZA');
 let calls=0;
 const refreshed=await loadObservations('',new AbortController().signal,async(url,options)=>{calls++;assert.equal(options.headers['If-None-Match'],'"verified-algeria-page"');return new Response(null,{status:304});},'Harmonized',previous,'DZA');
 assert.equal(calls,1);assert.equal(refreshed,previous);
});

test('Morocco extra map layers retain the requested catalog snapshot after the country merge',async()=>{
 const result=await loadObservations('',new AbortController().signal,async(url,options)=>{
  assert.equal(new URL(url,'http://localhost').searchParams.get('snapshot'),hash);
  assert.equal(options.headers['If-None-Match'],undefined);
  return new Response(JSON.stringify(page()));
 },'Harmonized',undefined,'MAR',hash);
 assert.equal(result.metadata.gold_snapshot,hash);
});
