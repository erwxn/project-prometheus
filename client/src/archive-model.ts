import type { AreaFeature, FireCollection, SensorFilter } from './analytics-model';
import type { FireFeature } from './fire-data';
export interface ArchivePartition {sensor:string;platform:string;month:string;count:number}
export interface ArchiveCatalog {temporary:boolean;total:number;partitions:ArchivePartition[]}
export interface ArchiveSelection {platform:string;year:string;month:string;startDate:string;endDate:string}
export interface ArchiveBucket {date:string;count:number;frpSum:number;frpCount:number;maxFrp:number|null;hours:number[];solarHours:number[];sources:Record<string,number>;bands:number[];strongest:ArchiveRow[];methods:string[];first:string|null;last:string|null}
export interface ArchiveRow {sensor:string;platform:string;lat:number;lon:number;date:string;time:string;frp:number;confidence:string;version:string;source:string}
export interface ArchiveSummary {metadata?:{source:string;version:string;coverage_status:string;scope:string};daily:ArchiveBucket[];monthly:ArchiveBucket[];yearly:ArchiveBucket[];totals:ArchiveBucket;baselineReason:string}
export interface ArchiveMap extends FireCollection {total:number;nextCursor:number|null}
export function archiveDefaults(c:ArchiveCatalog,platform?:string):ArchiveSelection {const p=c.partitions.find(p=>p.platform===platform)||c.partitions.find(p=>p.sensor==='MODIS')||c.partitions[0];const year=c.partitions.filter(r=>r.platform===p.platform).map(r=>r.month.slice(0,4)).sort().at(-1)!;return {platform:p.platform,year,month:'ALL',startDate:`${year}-01-01`,endDate:`${year}-12-31`};}
export function archiveSensor(platform:string,c:ArchiveCatalog|null):SensorFilter {return platform==='ALL'?'ALL':c?.partitions.find(p=>p.platform===platform)?.sensor as SensorFilter || 'MODIS';}
export function archiveFeature(r:ArchiveRow):FireFeature {return {type:'Feature',geometry:{type:'Point',coordinates:[r.lon,r.lat]},properties:{satellite:r.sensor,platform:r.platform,raw_frp:r.frp,normalized_frp:null,observed_at_utc:`${r.date}T${r.time}:00.000Z`,acq_time_utc:r.time,local_solar_time:r.time,confidence:r.confidence}};}
export interface ArchiveQuery {country?:string|null;platform:string;startDate:string;endDate:string;area:AreaFeature|null}
