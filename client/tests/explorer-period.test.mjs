import {test} from 'node:test';
import assert from 'node:assert/strict';
import {archivePeriod,explorerDatasetKey} from '../src/explorer-period.ts';
import {matchesTime,MINUTE} from '../src/timeline.ts';

test('archive month selection includes its first and last day and excludes the following month',()=>{
 const period=archivePeriod('2024-02-01','2024-02-29');
 assert.equal(period.durationMinutes,29*1440);
 for(const date of ['2024-02-01T00:00:00Z','2024-02-15T12:00:00Z','2024-02-29T23:59:00Z']) assert.ok(matchesTime(Date.parse(date),period.start,period.durationMinutes,true,period.durationMinutes));
 assert.equal(matchesTime(Date.parse('2024-03-01T00:00:00Z'),period.start,period.durationMinutes,true,period.durationMinutes),false);
 assert.equal(period.start+period.durationMinutes*MINUTE,Date.parse('2024-03-01T00:00:00Z'));
});
test('new map pages preserve playback identity while a changed applied period resets it',()=>{
 const key=page=>explorerDatasetKey(true,'Aqua','2026-01-01','2026-12-31',page);
 assert.equal(key([]),key([{}]));
 assert.notEqual(key([]),explorerDatasetKey(true,'Aqua','2025-01-01','2025-12-31',[]));
 const a=[],b=[];
 assert.notEqual(explorerDatasetKey(false,undefined,'','',a),explorerDatasetKey(false,undefined,'','',b));
});
