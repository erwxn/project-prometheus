const {parentPort,workerData}=require('node:worker_threads');
const {DatabaseSync}=require('node:sqlite');
const fs=require('node:fs');
const {validateQuery,bounds,contains}=require('./archive-validation');
const {solarTime}=require('./modis-csv');
const filename=workerData.filename,stat=fs.statSync(filename),identity=`v2:${stat.size}:${stat.mtimeMs}`;
const db=new DatabaseSync(filename,{readOnly:true});
const side=new DatabaseSync(filename+'.archive-v2.sqlite');
side.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA cache_size=-32768; CREATE TABLE IF NOT EXISTS identity(value TEXT);');
function empty(date){return {date,count:0,frpSum:0,frpCount:0,maxFrp:null,hours:Array(24).fill(0),solarHours:Array(24).fill(0),sources:{},bands:[0,0,0],strongest:[],methods:[],first:null,last:null};}
function feature(r){const utc=`${r.date}T${r.time}:00.000Z`,solar=solarTime(utc,r.lon);return {type:'Feature',id:`archive-${r.platform}-${r.lat}-${r.lon}-${r.date}-${r.time}`,geometry:{type:'Point',coordinates:[r.lon,r.lat]},properties:{satellite:r.sensor,platform:r.platform,raw_frp:r.frp,normalized_frp:null,observed_at_utc:utc,acq_time_utc:r.time,local_solar_date:solar.date,local_solar_time:solar.time,confidence:({l:'low',n:'nominal',h:'high'})[r.confidence]||r.confidence,product_version:r.version,source_file:r.source}};}
function add(a,r){a.count++;a.hours[Number(r.time.slice(0,2))]++;const minute=Number(r.time.slice(0,2))*60+Number(r.time.slice(3))+r.lon*4;a.solarHours[Math.floor(((minute%1440+1440)%1440)/60)]++;a.sources[r.sensor]=(a.sources[r.sensor]||0)+1;const method=`${r.platform}/${r.version||'unknown'}`;if(!a.methods.includes(method))a.methods.push(method);const utc=r.date+'T'+r.time+':00.000Z';if(!a.first||utc<a.first)a.first=utc;if(!a.last||utc>a.last)a.last=utc;
 if(typeof r.frp==='number'&&Number.isFinite(r.frp)&&r.frp>=0){a.frpSum+=r.frp;a.frpCount++;a.maxFrp=Math.max(a.maxFrp??0,r.frp);a.bands[r.frp<50?0:r.frp<=150?1:2]++;a.strongest.push(r);a.strongest.sort((x,y)=>y.frp-x.frp);a.strongest.length=Math.min(8,a.strongest.length);}}
function merge(a,b){a.count+=b.count;a.frpSum+=b.frpSum;a.frpCount+=b.frpCount;if(b.maxFrp!==null)a.maxFrp=Math.max(a.maxFrp??0,b.maxFrp);for(let i=0;i<24;i++){a.hours[i]+=b.hours[i];a.solarHours[i]+=b.solarHours[i];}for(let i=0;i<3;i++)a.bands[i]+=b.bands[i];for(const [k,v]of Object.entries(b.sources))a.sources[k]=(a.sources[k]||0)+v;a.methods=[...new Set([...a.methods,...b.methods])];a.strongest.push(...b.strongest);a.strongest.sort((x,y)=>y.frp-x.frp);a.strongest.length=Math.min(8,a.strongest.length);if(b.first&&(!a.first||b.first<a.first))a.first=b.first;if(b.last&&(!a.last||b.last>a.last))a.last=b.last;return a;}
function initialize(){
 if(side.prepare('SELECT value FROM identity').get()?.value===identity)return;
 side.exec('DROP TABLE IF EXISTS spatial; DROP TABLE IF EXISTS keys; DROP TABLE IF EXISTS daily; DELETE FROM identity; CREATE TABLE keys(id INTEGER PRIMARY KEY,platform TEXT,lat REAL,lon REAL,date TEXT,time TEXT); CREATE VIRTUAL TABLE spatial USING rtree(id,west,east,south,north); CREATE TABLE daily(platform TEXT,date TEXT,value TEXT,PRIMARY KEY(platform,date)) WITHOUT ROWID;');
 side.exec('BEGIN');
 const key=side.prepare('INSERT INTO keys(platform,lat,lon,date,time) VALUES(?,?,?,?,?)');const spatial=side.prepare('INSERT INTO spatial VALUES(?,?,?,?,?)');const daily=side.prepare('INSERT INTO daily VALUES(?,?,?)');let current=null,platform=null;
 for(const r of db.prepare('SELECT * FROM observations ORDER BY platform,date,time').iterate()){
 const id=key.run(r.platform,r.lat,r.lon,r.date,r.time).lastInsertRowid;spatial.run(id,r.lon,r.lon,r.lat,r.lat);
 if(current&&(platform!==r.platform||current.date!==r.date)){daily.run(platform,current.date,JSON.stringify(current));current=null;}
 if(!current){current=empty(r.date);platform=r.platform;}add(current,r);
 }
 if(current)daily.run(platform,current.date,JSON.stringify(current));
 side.prepare('INSERT INTO identity VALUES(?)').run(identity);side.exec('COMMIT; CREATE INDEX IF NOT EXISTS keys_date ON keys(platform,date,time);');
}
initialize();
// Attach only after building: the source is always opened read-only.
side.prepare('ATTACH DATABASE ? AS source').run(filename);
const platforms=db.prepare('SELECT DISTINCT platform FROM observations').all().map(r=>r.platform);
function check(cancel){if(Atomics.load(cancel,0))throw Object.assign(Error('Archive request cancelled.'),{status:499});}
function rows(q,ordered=true){let sql='SELECT o.* FROM source.observations o',args=[];let where=[];
 const box=q.area?bounds(q.area):q.viewport;
 const spatial=box && (box[2]-box[0])*(box[3]-box[1])<1200;
 if(spatial){sql='SELECT o.* FROM spatial s CROSS JOIN keys k ON k.id=s.id CROSS JOIN source.observations o ON o.platform=k.platform AND o.lat=k.lat AND o.lon=k.lon AND o.date=k.date AND o.time=k.time';where.push('s.east>=? AND s.west<=? AND s.north>=? AND s.south<=?');args.push(box[0],box[2],box[1],box[3]);}
 if(box&&!spatial){where.push('o.lon>=? AND o.lon<=? AND o.lat>=? AND o.lat<=?');args.push(box[0],box[2],box[1],box[3]);}
 const alias=spatial?'k':'o';
 if(q.platform!=='ALL'){where.push(alias+'.platform=?');args.push(q.platform);}
 where.push(alias+'.date>=? AND '+alias+'.date<?');args.push(q.selectedDay||q.startDate,new Date(Date.parse((q.selectedDay||q.endDate)+'T00:00:00Z')+86400000).toISOString().slice(0,10));
 return side.prepare(sql+' WHERE '+where.join(' AND ')+(ordered?' ORDER BY o.platform,o.date,o.time,o.lat,o.lon':'')).iterate(...args);
}
function dailyFor(q,cancel){const result=new Map();if(!q.area){let sql='SELECT value FROM daily WHERE date>=? AND date<=?',args=[q.startDate,q.endDate];if(q.platform!=='ALL'){sql+=' AND platform=?';args.push(q.platform);}for(const r of side.prepare(sql).iterate(...args)){check(cancel);const b=JSON.parse(r.value);result.set(b.date,merge(result.get(b.date)||empty(b.date),b));}}else{let i=0;for(const r of rows(q,false)){if(!(i++%512))check(cancel);if(contains(q.area,r.lon,r.lat)){const a=result.get(r.date)||empty(r.date);add(a,r);result.set(r.date,a);}}}return [...result.values()].sort((a,b)=>a.date.localeCompare(b.date));}
function summary(daily){const all=empty(null),monthly=new Map(),yearly=new Map();for(const d of daily){merge(all,d);for(const [map,key]of [[monthly,d.date.slice(0,7)],[yearly,d.date.slice(0,4)]])map.set(key,merge(map.get(key)||empty(key),d));}const peakCount= daily.length?Math.max(...daily.map(d=>d.count)):null;const means=daily.filter(d=>d.frpCount);const peakFrp=means.length?Math.max(...means.map(d=>d.frpSum/d.frpCount)):null;return {peaks:{detections:{value:peakCount,days:daily.filter(d=>d.count===peakCount).map(d=>d.date)},meanFrp:{value:peakFrp,days:means.filter(d=>d.frpSum/d.frpCount===peakFrp).map(d=>d.date)}},daily,monthly:[...monthly.values()],yearly:[...yearly.values()],totals:all,coverage:'unknown',baseline:null,baselineReason:'The archive does not establish complete satellite coverage. Three preceding complete comparable years are required.'};}
const cache=new Map();let bytes=0;
function query(kind,q,cancel){if(kind==='catalog'){const p=side.prepare('SELECT platform,min(date) observedFrom,max(date) observedTo FROM daily GROUP BY platform').all();return {platforms:p,identity};}
 if(kind==='observations'){let total=0,features=[],i=0;for(const r of rows(q)){if(!(i++%512))check(cancel);if(q.viewport&&(r.lon<q.viewport[0]||r.lon>q.viewport[2]||r.lat<q.viewport[1]||r.lat>q.viewport[3]))continue;if(!contains(q.area,r.lon,r.lat))continue;if(total>=q.cursor&&features.length<10000)features.push(feature(r));total++;}return {type:'FeatureCollection',features,total,nextCursor:q.cursor+features.length<total?q.cursor+features.length:null,scope:'loaded map observations',metadata:{source:'csv',temporary:true,source_name:'Temporary NASA FIRMS archive',total_features:features.length,has_harmonized:false}};}
 const key=JSON.stringify([kind,q]);if(cache.has(key)){const value=cache.get(key);cache.delete(key);cache.set(key,value);return value.data;}
 const data=kind==='comparison'?{...summary(dailyFor({...q,startDate:`${Math.min(...q.years)}-01-01`,endDate:`${Math.max(...q.years)}-12-31`},cancel).filter(d=>q.years.includes(Number(d.date.slice(0,4))))),years:q.years}:summary(dailyFor(q,cancel));
 const size=Buffer.byteLength(JSON.stringify(data));if(size<16*1024*1024){while(cache.size>=24||bytes+size>32*1024*1024){const k=cache.keys().next().value;if(k===undefined)break;bytes-=cache.get(k).size;cache.delete(k);}cache.set(key,{size,data});bytes+=size;}return data;
}
parentPort.on('message',m=>{try{check(m.cancel);const q=m.kind==='catalog'?{}:validateQuery(m.filters,platforms,m.kind);const result=query(m.kind,q,m.cancel);check(m.cancel);parentPort.postMessage({id:m.id,result});}catch(e){parentPort.postMessage({id:m.id,error:e.message,status:e.status||(e.message.includes('cancelled')?499:400)});}});
