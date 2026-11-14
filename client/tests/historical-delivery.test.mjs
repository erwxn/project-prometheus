import {test} from 'node:test';
import assert from 'node:assert/strict';
import {seasonalCells} from '../src/seasonal-heatmap.ts';
import {snapshotCsv,csvCell} from '../src/search-csv.ts';
import {feature} from './analytics-fixtures.mjs';
test('heatmap uses a common multi-year scale and keeps missing months distinct from explicit zero',()=>{
 const rows=seasonalCells([{date:'2024-01',count:0,frpSum:0,frpCount:0,complete:true},{date:'2024-02',count:10,frpSum:20,frpCount:2},{date:'2025-01',count:100,frpSum:0,frpCount:1}],'2024-01-01','2025-01-31','detections');
 assert.equal(rows[0][0].value,0);assert.equal(rows[0][0].complete,true);assert.equal(rows[0][2].value,null);assert.equal(rows[0][1].level,1);assert.equal(rows[1][0].level,4);assert.equal(rows[1][1].outside,true);
 assert.equal(seasonalCells([{date:'2024-01',count:0,frpSum:0,frpCount:0,complete:true}],'2024-01-10','2024-01-31','detections')[0][0].complete,false);
});
test('mean FRP preserves zero and never divides by zero',()=>{
 const rows=seasonalCells([{date:'2024-01',count:2,frpSum:0,frpCount:2},{date:'2024-02',count:2,frpSum:0,frpCount:0}],'2024-01-01','2024-02-29','mean-frp');assert.equal(rows[0][0].value,0);assert.equal(rows[0][1].value,null);
});
test('snapshot CSV includes every supplied search row, provenance and zero values',()=>{
 const features=Array.from({length:10003},(_,i)=>({...feature('2026-01-01',0,'MODIS',[-5.8,35.7]),id:String(i)}));
 const csv=snapshotCsv(features,'Test,"archive"','v1');assert.equal(csv.trim().split('\r\n').length,10004);assert.match(csv,/10002,/);assert.match(csv,/-5.8/);assert.match(csv,/v1/);assert.match(csv,/"Test,""archive"""/);
 assert.equal(csvCell(-5.8),'-5.8');assert.equal(csvCell('@formula'),"'@formula");
});
