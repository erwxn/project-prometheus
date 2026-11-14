import {test} from 'node:test';
import assert from 'node:assert/strict';
import {recentObservations,playbackObservations,newestDetections,detectionAge,measuredPower,monitorFeedStatus} from '../src/monitor-model.ts';
import {harmonizedWeeks,monitorWeeks,recordedWeek} from '../src/monitor-history.ts';
import {dashboardPage,navigateDashboard} from '../src/dashboard-navigation.ts';
import {collection,feature,polygon} from './analytics-fixtures.mjs';
const point=time=>({...feature(time.slice(0,10)),properties:{...feature(time.slice(0,10)).properties,observed_at_utc:time}});
test('monitor anchors to actual now, excludes historical, undated, and future records',()=>{
 const end=Date.parse('2026-11-14T16:00:00Z');
 const points=[point('2026-11-13T16:00:00Z'),point('2026-11-14T16:00:00Z'),point('2026-11-13T15:59:59Z'),point('2026-11-14T16:00:01Z'),point('2025-01-01T00:00:00Z'),{properties:{}}];
 assert.deepEqual(recentObservations(points,end),points.slice(0,2));
});
test('playback stays inside frozen day while now and incoming data advance',()=>{
 const anchor=Date.parse('2026-11-14T16:00:00Z');
 const points=[point('2026-11-13T16:10:00Z'),point('2026-11-14T15:30:00Z'),point('2026-11-14T16:10:00Z')];
 assert.deepEqual(playbackObservations(points,anchor,60),[points[0]]);
 assert.deepEqual(playbackObservations(points,anchor,1440),[points[1]]);
});
test('all experience routes resolve and monitor navigation stays within the shared dashboard',()=>{
 assert.equal(dashboardPage('/'),'explorer');assert.equal(dashboardPage('/analytics/'),'analytics');assert.equal(dashboardPage('/monitor/'),'monitor');assert.equal(dashboardPage('/monitor'),'monitor');
 const previous=globalThis.window,previousEvent=globalThis.PopStateEvent;let path;
 globalThis.window={location:{pathname:'/'},history:{pushState:(_,__,href)=>path=href},dispatchEvent:()=>{}};globalThis.PopStateEvent=Event;
 try {let prevented=false;navigateDashboard({button:0,metaKey:false,ctrlKey:false,shiftKey:false,altKey:false,preventDefault(){prevented=true;}},'/monitor/');assert.equal(prevented,true);assert.equal(path,'/monitor/');}finally{globalThis.window=previous;globalThis.PopStateEvent=previousEvent;}
});

test('detection list is bounded and newest first with playback-relative age and measured-only FRP',()=>{
 const points=Array.from({length:22},(_,i)=>point(`2026-11-14T15:${String(i).padStart(2,'0')}:00Z`));
 const newest=newestDetections(points);
 assert.equal(newest.length,20);
 assert.equal(newest[0],points[21]);
 assert.equal(newest[19],points[2]);
 assert.equal(detectionAge(newest[0],Date.parse('2026-11-14T15:25:00Z')),'4 min ago');
 assert.equal(measuredPower(feature('2026-11-14',0)),0);
 assert.equal(measuredPower(feature('2026-11-14',null)),null);
 assert.equal(measuredPower(feature('2026-11-14',22,'Harmonized')),null);
});

test('feed status distinguishes freshness, errors, snapshots and recovery',()=>{
 const live={source:'FIRMS',live:true};
 assert.equal(monitorFeedStatus(undefined,true,''),'Connecting');
 assert.equal(monitorFeedStatus(live,false,''),'Near-real-time feed');
 assert.equal(monitorFeedStatus({...live,feed_status:'stale'},false,''),'Update failed');
 assert.equal(monitorFeedStatus(live,false,'Network error'),'Update failed');
 assert.equal(monitorFeedStatus({source:'csv'},false,''),'Historical snapshot');
 assert.equal(monitorFeedStatus({...live,feed_status:'current'},false,''),'Near-real-time feed');
});

test('historical weeks include seven UTC dates and leave non-leap February 29 periods unavailable',()=>{
 const leap=monitorWeeks('2024-02-29');
 assert.deepEqual(leap[0].week,{year:2024,startDate:'2024-02-23',endDate:'2024-02-29'});
 assert.deepEqual(leap.slice(1).map(period=>period.week),[null,null,null]);
 assert.equal(monitorWeeks('2026-01-02')[0].week.startDate,'2025-12-27');
});

test('harmonized history shares the area, preserves coverage gaps and recognizes documented zero',()=>{
 const area=polygon([[-6,35],[-5,35],[-5,36],[-6,36],[-6,35]]);
 const meta={source:'harmonized',coverage_scope:'global',coverage:[{sensor:'Harmonized',startDate:'2025-11-07',endDate:'2025-11-13',status:'complete',method:'blend-v1'}]};
 const rows=[feature('2026-11-12',10,'Harmonized'),feature('2026-11-12',10,'Harmonized',[0,0]),feature('2025-11-10',10,'MODIS')];
 const results=harmonizedWeeks(collection(rows,meta),area,monitorWeeks('2026-11-13'));
 assert.deepEqual(results[0],{count:1,coverage:'partial',observedDays:1});
 assert.deepEqual(results[1],{count:0,coverage:'complete',observedDays:0,method:'blend-v1'});
 assert.equal(results[2].count,null);
 assert.deepEqual(recordedWeek({totals:{count:3},daily:[{count:3}]}),{count:3,observedDays:1,coverage:'unknown'});
 assert.equal(recordedWeek({totals:{count:0},daily:[]}).count,null);
});
