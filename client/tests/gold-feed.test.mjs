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
