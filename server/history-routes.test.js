const {test}=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const {registerHistoryRoutes,csvCell}=require('./history-routes');
const {createHarmonizedFeed,feedConfig}=require('./harmonized-feed');
const fs=require('node:fs'),path=require('node:path');
const fixture=fs.readFileSync(path.join(__dirname,'fixtures/harmonized.csv'),'utf8');
const f=(id,date='2026-11-14',coordinates=[2.35,48.85])=>({type:'Feature',id,geometry:{type:'Point',coordinates},properties:{satellite:'Harmonized',normalized_frp:0,raw_frp:null,observed_at_utc:date+'T12:00:00Z',model_version:'=untrusted',confidence:'Not provided'}});
async function start(options){const app=express();app.use(express.json());registerHistoryRoutes(app,options);const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));return {url:`http://127.0.0.1:${server.address().port}`,close:()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();})};}
const q={source:'snapshot',startDate:'2026-11-01',endDate:'2026-11-30',sensor:'Harmonized',country:'FRA'};
const post=(url,kind,body)=>fetch(url+'/api/v1/history/'+kind,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
test('historical query filters actual country and UTC bounds, keeps zero FRP, and supplies a dataset version',async()=>{
 const app=await start({loadSnapshot:async()=>({metadata:{source:'harmonized'},features:[f('inside'),f('sea','2026-11-14',[-4,50]),f('old','2025-11-14')]})});
 try{const r=await post(app.url,'query',q);assert.equal(r.status,200);const d=await r.json();assert.equal(d.total,1);assert.equal(d.aggregates.monthly[0].frpCount,1);assert.equal(d.aggregates.monthly[0].frpSum,0);assert.ok(d.metadata.version);assert.match(d.metadata.metric_definition,/not validated/);
 const csv=await post(app.url,'export.csv',{...q,expectedVersion:d.metadata.version});assert.equal(csv.status,200);const text=await csv.text();assert.match(text,/inside/);assert.doesNotMatch(text,/,sea,/);assert.match(text,/'=untrusted/);assert.equal(csv.headers.get('x-export-rows'),'1');
 for(const bad of [{country:'XXX'},{startDate:'2026-02-30'},{source:'bad'},{sensor:'invented'},{viewport:[-10,30,10,50]}])assert.equal((await post(app.url,'query',{...q,...bad})).status,400);
 assert.equal((await post(app.url,'export.csv',{...q,expectedVersion:'old'})).status,409);
 }finally{await app.close();}
});
test('archive CSV includes every page from zero and never silently truncates oversized searches',async()=>{
 const rows=Array.from({length:10003},(_,i)=>f(String(i)));
 const service={version:'archive-v1',query:async(kind,query)=>kind==='summary'?{monthly:[]}:{features:rows.slice(query.cursor,query.cursor+10000),total:rows.length,nextCursor:query.cursor+10000<rows.length?query.cursor+10000:null}};
 const app=await start({archiveService:service,loadSnapshot:async()=>{throw Error();}});
 try{assert.equal((await post(app.url,'query',{...q,source:'archive',platform:'Aqua',sensor:'VIIRS'})).status,400);const r=await post(app.url,'export.csv',{...q,sensor:'MODIS',source:'archive',platform:'Aqua',cursor:10000,expectedVersion:'archive-v1'});assert.equal(r.status,200);const text=await r.text();assert.equal(text.trim().split('\r\n').length,10004);assert.match(text,/\r\n0,/);assert.match(text,/\r\n10002,/);assert.equal(r.headers.get('x-dataset-version'),'archive-v1');}finally{await app.close();}
 const limited=await start({archiveService:service,loadSnapshot:async()=>{},maxExportRows:10000});
 try{const r=await post(limited.url,'export.csv',{...q,source:'archive',platform:'Aqua',sensor:'MODIS'});assert.equal(r.status,413);assert.match((await r.json()).error,/smaller region/);}finally{await limited.close();}
});
test('publication failure retains validated history; recovery replaces it and version checks protect exports',async()=>{
 let clock=0,published=fixture;
 const config=feedConfig({HARMONIZED_SOURCE:'https://example.org/history.csv'});
 const feed=createHarmonizedFeed(config,{now:()=>clock,fetchImpl:async()=>new Response(published)});
 const app=await start({loadSnapshot:()=>feed.get()});
 const query={...q,country:null};
 try{
  let response=await post(app.url,'query',query),initial=await response.json();assert.equal(initial.total,2);
  published='broken publication';clock+=61000;
  response=await post(app.url,'query',query);const stale=await response.json();assert.equal(stale.total,2);assert.equal(stale.metadata.feed_status,'stale');assert.equal(stale.metadata.version,initial.metadata.version);
  published=fixture.replace('185.2','222.2');clock+=61000;
  response=await post(app.url,'query',query);const recovered=await response.json();assert.equal(recovered.total,2);assert.notEqual(recovered.metadata.version,initial.metadata.version);assert.equal(recovered.metadata.feed_status,'current');assert.equal(recovered.features[0].properties.normalized_frp,222.2);
  assert.equal((await post(app.url,'export.csv',{...query,expectedVersion:initial.metadata.version})).status,409);
  published=fixture.split('\n')[0]+'\n';clock+=61000;
  response=await post(app.url,'query',query);const empty=await response.json();assert.equal(empty.total,0);assert.deepEqual(empty.aggregates.monthly,[]);
  const csv=await post(app.url,'export.csv',{...query,expectedVersion:empty.metadata.version});assert.equal((await csv.text()).trim().split('\r\n').length,1);
 }finally{await app.close();}
 const cold=await start({loadSnapshot:async()=>{throw Error('secret source details');}});
 try{const r=await post(cold.url,'query',query);assert.equal(r.status,503);assert.doesNotMatch(await r.text(),/secret source/);}finally{await cold.close();}
});
test('CSV quoting preserves numeric negatives and handles commas, quotes and formulas',()=>{assert.equal(csvCell(-5.8),'-5.8');assert.equal(csvCell('=1+1'),"'=1+1");assert.equal(csvCell('a,"b"'),'"a,""b"""');});
