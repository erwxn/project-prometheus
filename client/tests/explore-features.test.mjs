import {test} from 'node:test';
import assert from 'node:assert/strict';
import {countryCode,countryContains} from '../src/country-filter.ts';
import {readSharedExplore,shareExplore} from '../src/explore-share.ts';
import {detectionCells} from '../src/map-aggregation.ts';
import {feature,filters,polygon} from './analytics-fixtures.mjs';
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
test('density cells preserve total detections, separate distant points and handle polar coordinates',()=>{
 const points=Array.from({length:700},()=>feature('2026-01-01',1,'VIIRS',[2,48]));
 points.push(feature('2026-01-01',1,'VIIRS',[-120,40]),feature('2026-01-01',1,'VIIRS',[180,90]));
 const cells=detectionCells(points,2);
 assert.equal(cells.reduce((s,c)=>s+c.count,0),702);assert.equal(cells.length,3);assert.ok(cells.every(c=>c.coordinates.every(Number.isFinite)));
 assert.equal(cells.find(c=>c.count===700).kind,'cell');
});
