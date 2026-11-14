const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const {createArchiveService}=require('./archive-service');
const {validateQuery,validateArea}=require('./archive-validation');
const polygon=ring=>({type:'Feature',properties:{kind:'polygon'},geometry:{type:'Polygon',coordinates:[ring]}});
test('archive validation rejects invalid dates, parameters, bounds, and crossing polygons',()=>{
 const q={platform:'Terra',startDate:'2024-02-29',endDate:'2024-03-01'};
 assert.equal(validateQuery(q,['Terra'],'summary').startDate,'2024-02-29');
 for(const bad of [{platform:'no'},{startDate:'2023-02-29'},{endDate:'2024-01-01'},{viewport:[1,0,-1,2]},{cursor:-1},{selectedDay:'2024-03-02'}])assert.throws(()=>validateQuery({...q,...bad},['Terra'],'observations'));
 assert.throws(()=>validateArea(polygon([[0,0],[2,2],[0,2],[2,0],[0,0]])));
 assert.throws(()=>validateQuery({...q,platform:'ALL',years:[2024]},['Terra'],'comparison'));
});
test('worker aggregates whole scopes, preserves FRP weighting and geographic boundaries, and pages independently',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'prometheus-archive-'));const file=path.join(dir,'index.sqlite');const db=new DatabaseSync(file);
 db.exec('CREATE TABLE observations(sensor TEXT,platform TEXT,lat REAL,lon REAL,date TEXT,time TEXT,frp REAL,confidence TEXT,version TEXT,source TEXT,PRIMARY KEY(platform,lat,lon,date,time)) WITHOUT ROWID; CREATE INDEX by_partition ON observations(platform,date,time)');
 const put=db.prepare('INSERT INTO observations VALUES(?,?,?,?,?,?,?,?,?,?)');db.exec('BEGIN');
 for(const [date,lat,lon,frp,version]of [['2024-02-28',0,0,0,'1'],['2024-02-29',1,1,10,'1'],['2024-02-29',2,2,30,'1'],['2024-03-01',1,2,null,'2'],['2023-02-28',1,1,50,'1']])put.run('MODIS','Terra',lat,lon,date,'12:00',frp,'90',version,'test');
 put.run('MODIS','Terra',48.85,2.35,'2026-01-01','12:00',10,'90','1','test');
 put.run('MODIS','Terra',50,-4,'2026-01-01','12:00',20,'90','1','test');
 for(let i=0;i<50001;i++)put.run('VIIRS','SNPP',5,i/10000,'2024-08-01','00:00',1,'n','2','test');db.exec('COMMIT');db.close();
 assert.equal(createArchiveService(path.join(dir,'missing.sqlite')),null);
 const s=createArchiveService(file);const q={platform:'Terra',startDate:'2024-02-28',endDate:'2024-03-01'};
 try{
 const r=await s.query('summary',q);assert.equal(r.totals.count,4);assert.equal(r.totals.frpCount,3);assert.equal(r.totals.frpSum,40);assert.equal(r.totals.maxFrp,30);assert.equal(r.daily.length,3);assert.deepEqual(r.totals.hours.slice(12,13),[4]);assert.equal(r.baseline,null);assert.deepEqual(r.peaks.detections.days,['2024-02-29']);assert.deepEqual(r.totals.methods,['Terra/1','Terra/2']);
 const countryQuery={platform:'Terra',startDate:'2026-01-01',endDate:'2026-12-31',country:'FRA'};
 const countrySummary=await s.query('summary',countryQuery),countryMap=await s.query('observations',countryQuery);assert.equal(countrySummary.totals.count,1);assert.equal(countryMap.total,1);assert.equal(countryMap.features[0].geometry.coordinates[0],2.35);
 const ring=polygon([[0,0],[2,0],[2,1],[1,1],[1,2],[0,2],[0,0]]);const geo=await s.query('summary',{...q,area:ring});assert.equal(geo.totals.count,3); // origin + two boundary points, not cutout
 const broad=await s.query('summary',{...q,area:polygon([[-80,-30],[80,-30],[80,60],[-80,60],[-80,-30]])});assert.equal(broad.totals.count,4);
 const day=await s.query('observations',{...q,selectedDay:'2024-02-29'});assert.equal(day.total,2);
 const empty=await s.query('summary',{...q,startDate:'2024-01-01',endDate:'2024-01-02'});assert.equal(empty.daily.length,0);assert.equal(empty.totals.maxFrp,null);
 const history=await s.query('comparison',{...q,years:[2023,2024]});assert.equal(history.totals.count,5);assert.equal(history.daily.find(d=>d.date==='2024-02-29').count,2);
 const big={platform:'SNPP',startDate:'2024-01-01',endDate:'2024-12-31'};const all=await s.query('summary',big);assert.equal(all.totals.count,50001);
 const first=await s.query('observations',big),next=await s.query('observations',{...big,cursor:first.nextCursor});assert.equal(first.features.length,10000);assert.equal(next.features.length,10000);assert.equal(first.total,50001);assert.notEqual(first.features[0].id,next.features[0].id);
 const last=await s.query('observations',{...big,cursor:50000});assert.equal(last.features.length,1);assert.equal(last.nextCursor,null);
 const sharedCancel=new AbortController();const cancelled=s.query('summary',{...big,endDate:'2024-11-30'},sharedCancel.signal);const survivor=s.query('summary',{...big,endDate:'2024-11-30'});sharedCancel.abort();await assert.rejects(cancelled,/cancelled/);assert.equal((await survivor).totals.count,50001);
 const controller=new AbortController();const pending=s.query('summary',{...big,startDate:'2020-01-01'},controller.signal);controller.abort();await assert.rejects(pending,/cancelled/);
 }finally{await s.close();fs.rmSync(dir,{recursive:true,force:true});}
});

const {countryContains}=require('./archive-validation');
test('country queries validate codes and test actual multi-part boundaries',()=>{
 const q={platform:'Terra',startDate:'2026-01-01',endDate:'2026-12-31',country:'FRA'};
 assert.equal(validateQuery(q,['Terra'],'summary').country,'FRA');
 assert.throws(()=>validateQuery({...q,country:'XXX'},['Terra'],'observations'),/Unknown country/);
 assert.equal(countryContains('FRA',2.35,48.85),true);
 assert.equal(countryContains('FRA',-4,50),false);
 assert.equal(countryContains('USA',-157.8,21.3),true);
});
