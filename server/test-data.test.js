const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {openTestData}=require('./test-data');
const {spawnSync}=require('node:child_process');
test('ZIP ingestion deduplicates overlapping archives, prefers archive over NRT, and reports invalid rows',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'prometheus-ingestion-'));
  const input=path.join(dir,'input'), output=path.join(dir,'output');
  fs.mkdirSync(input);fs.mkdirSync(output);
  const fixture = spawnSync('python',['-c', `import zipfile,sys,pathlib
p=pathlib.Path(sys.argv[1])
h='latitude,longitude,acq_date,acq_time,satellite,confidence,frp,version\\n'
for name,member,rows in [('a.zip','fire_archive_M_test.csv','35,-5,2025-01-01,0030,Terra,85,10,6.1\\n35,-5,2025-02-31,0030,Terra,85,10,6.1\\n'),('b.zip','fire_archive_M_test.csv','35,-5,2025-01-01,0030,Terra,85,10,6.1\\n'),('c.zip','fire_nrt_M_test.csv','35,-5,2025-01-01,0030,Terra,85,99,6.1\\n')]:
 with zipfile.ZipFile(p/name,'w') as z:z.writestr(member,h+rows)
`,input],{encoding:'utf8'});
  assert.equal(fixture.status,0,fixture.stderr);
  const run=spawnSync('python',[path.join(__dirname,'import-test-data.py'),input,output],{encoding:'utf8'});
  assert.equal(run.status,0,run.stderr);
  const db=new DatabaseSync(path.join(output,'vis-test.sqlite'),{readOnly:true});
  assert.equal(db.prepare('SELECT count(*) n FROM observations').get().n,1);
  assert.equal(db.prepare('SELECT frp FROM observations').get().frp,10);
  db.close();
  const report=JSON.parse(fs.readFileSync(path.join(output,'vis-test-report.json'),'utf8'));
  assert.equal(report.files.reduce((n,f)=>n+f.rejected,0),1);
  assert.equal(report.files.reduce((n,f)=>n+f.duplicates,0),2);
  assert.ok(path.resolve(dir).startsWith(path.resolve(os.tmpdir())+path.sep));
  fs.rmSync(dir,{recursive:true});
});
test('temporary index keeps raw sensors, dates, confidence and source provenance separate',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'prometheus-test-index-'));
  const file=path.join(dir,'test.sqlite');
  const db=new DatabaseSync(file);
  db.exec('CREATE TABLE observations(sensor,platform,lat,lon,date,time,frp,confidence,version,source)');
  const insert=db.prepare('INSERT INTO observations VALUES(?,?,?,?,?,?,?,?,?,?)');
  insert.run('MODIS','Terra',35,-5,'2025-01-01','00:05',0,'85','6.1','archive.csv');
  insert.run('VIIRS','N20',35,-5,'2025-02-01','13:30',12,'n','2','viirs.csv');
  db.close();
  const data=openTestData(file);
  try {
    assert.equal(data.catalog.total,2);
    const raw=data.collection();assert.equal(raw.features[0].properties.satellite,'MODIS');
    assert.equal(raw.features[0].properties.raw_frp,0);
    assert.equal(raw.metadata.temporary,true);
    const viirs=data.collection('N20','2025-02');
    assert.equal(viirs.features[0].properties.satellite,'VIIRS');
    assert.equal(viirs.features[0].properties.confidence,'nominal');
    assert.equal(viirs.features[0].properties.normalized_frp,null);
    assert.equal(viirs.features[0].properties.source_file,'viirs.csv');
    assert.equal(viirs.metadata.coverage,undefined);
    assert.equal(data.collection('N20','2025-02',1),null);
    assert.equal(data.collection("'; DROP TABLE observations;--",'2025-02'),null);
  } finally {data.close();fs.unlinkSync(file);fs.rmdirSync(dir);}
});
test('large monthly slices are bounded and remaining records stay accessible',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'prometheus-page-test-'));
  const file=path.join(dir,'test.sqlite');const db=new DatabaseSync(file);
  db.exec(`CREATE TABLE observations(sensor,platform,lat,lon,date,time,frp,confidence,version,source);
    WITH RECURSIVE n(x) AS (SELECT 0 UNION ALL SELECT x+1 FROM n WHERE x<50000)
    INSERT INTO observations SELECT 'VIIRS','N20',35,-5+x*0.000001,'2025-01-01','12:00',10,'n','2','test.csv' FROM n;`);
  db.close();const data=openTestData(file);
  try {
    const first=data.collection('N20','2025-01',0), second=data.collection('N20','2025-01',1);
    assert.equal(first.features.length,50000);assert.equal(second.features.length,1);
    assert.equal(first.metadata.partition_total,50001);assert.equal(first.metadata.test_pages,2);
    assert.notEqual(first.features.at(-1).id,second.features[0].id);
    assert.equal(data.collection('N20','2025-01',2),null);
  } finally {data.close();fs.unlinkSync(file);fs.rmdirSync(dir);}
});
