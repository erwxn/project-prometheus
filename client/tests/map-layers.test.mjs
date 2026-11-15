import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepareObservations } from '../src/analytics-engine.ts';
import { selectMapLayers } from '../src/map-layers.ts';

test('map layers combine sources independently of chart sensor while retaining date and area filters', () => {
  const feature = (satellite, date, lon = 0) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [lon, 0] }, properties: { satellite, observed_at_utc: date + 'T12:00:00Z' } });
  const rows = prepareObservations([
    feature('MODIS', '2023-07-01'), feature('VIIRS', '2023-07-01'), feature('Harmonized', '2023-07-01'),
    feature('VIIRS', '2022-01-01'), feature('MODIS', '2023-07-02'), feature('MODIS', '2023-07-01', 10),
  ]);
  const filters = { sensor: 'MODIS', metric: 'detections', country: null, simulatedPlatform: null, startDate: '2023-07-01', endDate: '2023-07-02', selectedDay: '2023-07-01', area: { type: 'Feature', properties: { kind: 'rectangle' }, geometry: { type: 'Polygon', coordinates: [[[-1,-1],[1,-1],[1,1],[-1,1],[-1,-1]]] } } };
  assert.deepEqual(selectMapLayers(rows, filters, ['MODIS', 'VIIRS', 'Harmonized']).map(r => r.sensor), ['MODIS', 'VIIRS', 'Harmonized']);
  assert.deepEqual(selectMapLayers(rows, filters, ['VIIRS', 'Harmonized']).map(r => r.sensor), ['VIIRS', 'Harmonized']);
  assert.equal(selectMapLayers(rows, filters, []).length, 0);
  assert.equal(filters.sensor, 'MODIS');
});
import {modelCellVisible} from '../src/map-layers.ts';
test('merged map rules retain Algeria candidates and Morocco frozen decisions separately',()=>{
 const candidate={satellite:'Harmonized',record_unit:'model_candidate',raw_frp:null,normalized_frp:null,acq_time_utc:'12:00',local_solar_time:'12:00',confidence:'Not supplied',harmonization_score:0.1};
 assert.equal(modelCellVisible({...candidate,country_iso3:'DZA'},false,false),true);
 assert.equal(modelCellVisible({...candidate,country_iso3:'DZA'},true,false),false);
 assert.equal(modelCellVisible({...candidate,country_iso3:'MAR',detect_f1:false},false,false),false);
 assert.equal(modelCellVisible({...candidate,country_iso3:'MAR',detect_f1:true},false,false),true);
 assert.equal(modelCellVisible({...candidate,country_iso3:'MAR',detect_f1:true},true,false),false);
 assert.equal(modelCellVisible({...candidate,record_unit:undefined,satellite:'MODIS'},true,false),true);
});
