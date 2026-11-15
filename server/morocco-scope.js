const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const pointInPolygon = require('@turf/boolean-point-in-polygon').booleanPointInPolygon;
const boundaryPath = path.join(__dirname, 'config', 'morocco.geojson');
const bytes = fs.readFileSync(boundaryPath);
const boundary = JSON.parse(bytes);
const boundarySha256 = crypto.createHash('sha256').update(bytes).digest('hex');
const database = path.join(__dirname, 'data', 'morocco.sqlite');
function contains(longitude, latitude) {
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return false;
  return boundary.features.some(f => pointInPolygon([longitude, latitude], f));
}
function scope(collection) {
  if (!collection || collection.type !== 'FeatureCollection') return collection;
  const features = collection.features.filter(f => f.geometry?.type === 'Point' && contains(...f.geometry.coordinates));
  const sourceName=collection.metadata?.temporary ? 'Verified Morocco FIRMS archive' : collection.metadata?.source_name;
  return {...collection, features, metadata:{...collection.metadata,source_name:sourceName,total_features:features.length,country_iso3:'MAR',boundary_sha256:boundarySha256,study_area:'Morocco; Western Sahara separate'}};
}
function middleware(req,res,next) {
  const send = res.json.bind(res);
  res.json = data => send(scope(data));
  next();
}
function predictions() {
  const file=path.join(__dirname,'data','morocco-predictions.geojson');
  const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,'data','morocco-dataset.json'),'utf8'));
  const body=fs.readFileSync(file);
  if(crypto.createHash('sha256').update(body).digest('hex')!==manifest.predictions_sha256)throw Error('Prediction snapshot integrity failure');
  return scope(JSON.parse(body));
}
module.exports={contains,scope,middleware,predictions,boundarySha256,database};
