import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mapFeedback} from '../src/map-feedback.ts';

test('VIIRS request lifecycle shows loading before records arrive, never a premature empty result',()=>{
 assert.equal(mapFeedback(true,'',0),'loading');
 assert.equal(mapFeedback(true,'',10000),'loading');
 assert.equal(mapFeedback(false,'',10000),null);
 assert.equal(mapFeedback(false,'',0),'empty');
 assert.equal(mapFeedback(false,'Request failed',0),'error');
 assert.equal(mapFeedback(true,'Previous request failed',0),'loading');
});
