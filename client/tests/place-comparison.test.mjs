import assert from 'node:assert/strict';
import { test } from 'node:test';
import { boundaryAreaKm2, compareMonths } from '../src/place-comparison.ts';

test('comparison separates unknown activity from covered zero and partial records', () => {
  const result = compareMonths(['2024-01-31', '2024-02-01', '2024-03-01', '2024-03-02'], new Map([['2024-03-01', 2]]), new Set(['2024-02-01', '2024-03-01']));
  assert.deepEqual([...result.months], [
    ['2024-01', { count: null, complete: false }],
    ['2024-02', { count: 0, complete: true }],
    ['2024-03', { count: 2, complete: false }],
  ]);
  assert.equal(result.covered, 2);
});

test('area sums islands, subtracts holes, and treats the date line as a short edge', () => {
  const ring = [[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]];
  const hole = [[0.5, 0.5], [1, 0.5], [1, 1], [0.5, 1], [0.5, 0.5]];
  const dateLine = [[179, 0], [-179, 0], [-179, 2], [179, 2], [179, 0]];
  const polygon = (...coordinates) => boundaryAreaKm2({ type: 'Polygon', coordinates });
  assert.ok(polygon(ring) > 49_000 && polygon(ring) < 50_000);
  assert.equal(polygon(ring), polygon(dateLine));
  assert.equal(polygon(ring, hole), polygon(ring) - polygon(hole));
  assert.equal(boundaryAreaKm2({ type: 'MultiPolygon', coordinates: [[ring, hole], [dateLine]] }), polygon(ring, hole) + polygon(dateLine));
});
import {goldPlaceComparison} from '../src/gold-place-comparison.ts';
const hash='a'.repeat(64),dzaHash='b'.repeat(64);
function comparisonRequest(calls){return async url=>{
 calls.push(url);const query=new URL(url,'http://localhost').searchParams;
 if(query.get('country')==='DZA')return new Response(JSON.stringify({metadata:{country_iso3:'DZA',dataset:'algeria_harmonized_predictions',snapshot:dzaHash},page:1,total_pages:1,filtered_count:1,data:[{record_id:'dza-row',country_iso3:'DZA',observed_at_utc:'2015-09-22T13:05:00Z',longitude:0,latitude:35,harmonization_score:0.1,frp_cell_mw:null}]}));
 const sensor=query.get('sensor');return new Response(JSON.stringify({type:'FeatureCollection',metadata:{gold:true,source:sensor==='Harmonized'?'harmonized':'gold',country_iso3:'MAR',gold_sensor:sensor,gold_snapshot:hash,gold_page:1,gold_pages:1,total_features:1},features:[{type:'Feature',id:'mar-row',geometry:{type:'Point',coordinates:[-5,34]},properties:{satellite:sensor,country_iso3:'MAR',gold_verified:true,observed_at_utc:'2015-09-22T12:00:00Z',raw_frp:null,normalized_frp:null}}]}));
};}

test('general country comparison loads Morocco and Algeria independently of the active map dataset',async()=>{
 const calls=[];const result=await goldPlaceComparison('',['MAR','DZA'],'Harmonized',['2015-09-22'],new AbortController().signal,comparisonRequest(calls));
 assert.equal(calls.length,2);assert.equal(result[0].months.get('2015-09').count,1);assert.equal(result[1].months.get('2015-09').count,1);
 assert.equal(result[0].snapshot,hash);assert.equal(result[1].snapshot,dzaHash);assert.equal(result[1].covered,0);
});

test('other selectable countries remain unavailable rather than silently becoming zero',async()=>{
 const calls=[];const result=await goldPlaceComparison('',['ESP','DZA'],'Harmonized',['2015-09-22'],new AbortController().signal,comparisonRequest(calls));
 assert.equal(calls.length,1);assert.equal(result[0].months.get('2015-09').count,null);assert.match(result[0].availability,/No Gold dataset/);
 assert.equal(result[1].months.get('2015-09').count,1);
});

test('Algeria model scores are not substituted for missing FIRMS observations',async()=>{
 const calls=[];const result=await goldPlaceComparison('',['MAR','DZA'],'VIIRS',['2015-09-22'],new AbortController().signal,comparisonRequest(calls));
 assert.equal(calls.length,1);assert.equal(result[0].months.get('2015-09').count,1);assert.equal(result[1].months.get('2015-09').count,null);assert.match(result[1].availability,/no FIRMS observations/);
});

test('chosen comparison dates exclude Algeria records outside its published year without inventing zeros',async()=>{
 const result=await goldPlaceComparison('',['DZA','MAR'],'Harmonized',['2016-09-22'],new AbortController().signal,comparisonRequest([]));
 assert.ok(result.every(place=>place.months.get('2016-09').count===null));
});
