import {test} from 'node:test';
import assert from 'node:assert/strict';
import {countryCode,countryContains} from '../src/country-filter.ts';
import {readSharedExplore,shareExplore} from '../src/explore-share.ts';
import {filters,polygon} from './analytics-fixtures.mjs';
test('country boundaries filter islands and exclude bounding-box cutouts',()=>{
 assert.equal(countryCode(['France','FR','FRA']),'FRA');
 assert.equal(countryContains('FRA',[2.35,48.85]),true);
 assert.equal(countryContains('FRA',[8.8,42]),true);
 assert.equal(countryContains('FRA',[-4,50]),false);
 assert.equal(countryContains('USA',[-157.8,21.3]),true);
 assert.equal(countryContains('USA',[-100,40]),true);
 assert.equal(countryContains('USA',[0,0]),false);
 assert.equal(countryContains('XXX',[0,0]),false);
});
test('shared searches round trip dates, region, source, platform and camera without executable input',()=>{
 const view={filters:{...filters(),country:'FRA',area:polygon([[0,0],[2,0],[2,2],[0,2],[0,0]])},camera:{longitude:2,latitude:48,zoom:5,pitch:0,bearing:0},platform:'Aqua',dataset:'Test archive',timeline:{scope:'file',basis:'utc',cursorMinute:1440,allHours:true,windowStart:null}};
 const link=shareExplore('https://example.com/analytics/',view);
 assert.deepEqual(readSharedExplore(new URL(link).search),view);
 for(const patch of [{camera:{longitude:999}},{filters:{...view.filters,country:'XXX'}},{filters:{...view.filters,country:'constructor'}},{filters:{...view.filters,startDate:'bad'}},{filters:{sensor:'ALL'}}])assert.equal(readSharedExplore('?view='+encodeURIComponent(JSON.stringify({...view,...patch}))),null);
 assert.equal(readSharedExplore('?view=%7B'),null);
});

test('Morocco selection follows the study polygon instead of the regional search rectangle',()=>{
 assert.equal(countryCode(['MA','MAR','Maroc']),'MAR');
 assert.equal(countryContains('MAR',[-5,34]),true);
 assert.equal(countryContains('MAR',[-4,28]),false);
 assert.equal(countryContains('MAR',[-13.2,27.1]),false);
});
