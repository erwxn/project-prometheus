const {test}=require('node:test');
const assert=require('node:assert/strict');
const {contains,scope,boundarySha256}=require('./morocco-scope');
test('Morocco polygon excludes neighbouring countries inside the broad search rectangle and Western Sahara',()=>{
 assert.equal(contains(-5,34),true);assert.equal(contains(-4,28),false);assert.equal(contains(-3,35.5),false);assert.equal(contains(-13.2,27.1),false);
});
test('API geographic filter preserves measurements and exposes the exact boundary identity',()=>{
 const feature=(lon,lat)=>({type:'Feature',geometry:{type:'Point',coordinates:[lon,lat]},properties:{satellite:'MODIS',raw_frp:0,normalized_frp:null}});
 const result=scope({type:'FeatureCollection',metadata:{source:'csv'},features:[feature(-5,34),feature(-4,28)]});
 assert.equal(result.features.length,1);assert.equal(result.features[0].properties.raw_frp,0);assert.equal(result.metadata.country_iso3,'MAR');assert.equal(result.metadata.boundary_sha256,boundarySha256);
});

test('the shared country selector and API use the exact versioned Morocco polygon',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const actual=JSON.parse(fs.readFileSync(path.join(__dirname,'config','morocco.geojson'),'utf8'));
 const metadata=JSON.parse(fs.readFileSync(path.join(__dirname,'config','morocco.metadata.json'),'utf8'));
 assert.equal(boundarySha256,metadata.sha256);
 assert.deepEqual(require('../shared/countries.json').MAR.geometry,actual.features[0].geometry);
 const {countryContains}=require('./archive-validation');
 for(const [lon,lat] of [[-5,34],[-4,28],[-3,35.5],[-13.2,27.1]])assert.equal(countryContains('MAR',lon,lat),contains(lon,lat));
});
