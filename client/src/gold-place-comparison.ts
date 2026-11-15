import {loadObservations} from './fire-api.ts';
import {prepareObservations} from './analytics-engine.ts';
import {compareMonths,snapshotComparison} from './place-comparison.ts';
import type {SensorFilter} from './analytics-model.ts';

/** Loads each selected country's actual publication; unpublished sources remain unknown, never zero. */
export async function goldPlaceComparison(base:string,codes:string[],sensor:SensorFilter,dates:string[],signal:AbortSignal,request:typeof fetch=fetch){
 return Promise.all(codes.map(async code=>{
  const unavailable=(reason:string)=>({code,...compareMonths(dates,new Map(),new Set()),snapshot:null as string|null,availability:reason});
  if(code!=='MAR'&&code!=='DZA')return unavailable('No Gold dataset is published for this country.');
  if(sensor==='ALL')throw Error('Choose one sensor or harmonized dataset to compare.');
  if(code==='DZA'&&sensor!=='Harmonized')return unavailable('Algeria has Model B candidate scores for 2015; no FIRMS observations were supplied.');
  const collection=await loadObservations(base,signal,request,sensor,undefined,code);
  if(collection.metadata.country_iso3!==code)throw Error('The selected country publication did not match the response.');
  return {code,...snapshotComparison(dates,prepareObservations(collection.features),collection.metadata,sensor,code),snapshot:collection.metadata.gold_snapshot||null,
   availability:code==='DZA'?'Committed Algeria data - 2015 model candidates.':'Committed Morocco Gold data.'};
 }));
}
