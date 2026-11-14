import {test} from 'node:test';
import assert from 'node:assert/strict';
import {recentObservations,playbackObservations} from '../src/monitor-model.ts';
import {dashboardPage,navigateDashboard} from '../src/dashboard-navigation.ts';
import {feature} from './analytics-fixtures.mjs';
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
