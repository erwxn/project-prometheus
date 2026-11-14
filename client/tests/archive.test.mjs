import {test} from 'node:test';
import assert from 'node:assert/strict';
import {archiveDefaults} from '../src/archive-model.ts';
import {initialDashboardState,dashboardReducer} from '../src/dashboard-state.ts';
import {collection,feature,polygon} from './analytics-fixtures.mjs';
test('archive defaults use real platform years and map paging retains applied filters',()=>{
 const catalog={temporary:true,total:10,partitions:[{sensor:'VIIRS',platform:'N20',month:'2024-02',count:2},{sensor:'MODIS',platform:'Terra',month:'2022-01',count:8}]};
 assert.equal(archiveDefaults(catalog).platform,'Terra');const selection=archiveDefaults(catalog,'N20');assert.equal(selection.year,'2024');assert.equal(selection.month,'ALL');
 let state=initialDashboardState(collection());const area=polygon([[0,0],[2,0],[2,2],[0,2],[0,0]]);state=dashboardReducer(state,{type:'filters',patch:{area}});
 state=dashboardReducer(state,{type:'archive-apply',selection,sensor:'VIIRS',reset:false});assert.equal(state.filters.area,area);assert.equal(state.filters.endDate,'2024-12-31');
 state=dashboardReducer(state,{type:'filters',patch:{selectedDay:'2024-02-29'}});const filters=state.filters;
 state=dashboardReducer(state,{type:'archive-map',collection:collection([feature('2024-02-29',20,'VIIRS')])});assert.equal(state.filters,filters);assert.equal(state.collection.metadata.archive,true);
 const saved=state;state=dashboardReducer(state,{type:'loaded',collection:collection([feature('2025-01-01')],{source:'simulated'}),remember:false});state=dashboardReducer(state,{type:'return-loaded'});assert.equal(state.collection.metadata.archive,true);assert.equal(state.filters.endDate,'2024-12-31');state=saved;
 state=dashboardReducer(state,{type:'archive-apply',selection,sensor:'VIIRS',reset:true});assert.equal(state.filters.area,null);assert.equal(state.filters.selectedDay,null);
 state=dashboardReducer(state,{type:'loaded',collection:collection([feature('2025-01-01')],{uploaded:true,source:'csv'}),remember:true});const uploaded=state;state=dashboardReducer(state,{type:'archive-map',collection:collection()});assert.equal(state,uploaded);
});
