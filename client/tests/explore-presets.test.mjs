import {test} from 'node:test';
import assert from 'node:assert/strict';
import {explorePreset} from '../src/explore-presets.ts';
test('Explore shortcuts use available observation dates, including leap days and year boundaries',()=>{
 assert.deepEqual(explorePreset('2024-03-01T23:59:00Z',7),{startDate:'2024-02-24',endDate:'2024-03-01'});
 assert.deepEqual(explorePreset('2026-01-02T00:01:00Z',7),{startDate:'2025-12-27',endDate:'2026-01-02'});
 assert.deepEqual(explorePreset('2020-07-03T12:00:00Z',1),{startDate:'2020-07-03',endDate:'2020-07-03'});
 assert.equal(explorePreset(null,7),null);assert.equal(explorePreset('invalid',7),null);
});
