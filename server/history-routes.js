const { createHash } = require('node:crypto');
const { validateQuery, countryContains, contains } = require('./archive-validation');

const COLUMNS = ['id','observed_at_utc','latitude','longitude','sensor','platform','raw_frp_mw','harmonized_frp_mw','confidence','model_version','product_version','dataset_version','source','record_unit','fire_id','region','source_sensor','harmonized_to','p_viirs','p_uncertainty','detect_f1','cell_column','cell_row','cell_area_km2','cell_wkt','frp_group_viirs_eq_mw'];
/** Quotes CSV cells and neutralizes spreadsheet formulas in text fields. */
function csvCell(value) {
  if (value === null || value === undefined) return '';
  let text = String(value);
  if (typeof value === 'string' && /^[\s]*[=+\-@]/.test(text)) text = "'" + text;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"','""')}"` : text;
}
function csvRow(feature, metadata) {
  const p=feature.properties;
  return [feature.id,p.observed_at_utc,...[feature.geometry.coordinates[1],feature.geometry.coordinates[0]],p.satellite,p.platform,p.raw_frp,p.normalized_frp,p.confidence,p.model_version,p.product_version,metadata.version,metadata.source,p.record_unit,p.fire_id,p.region,p.source_sensor,p.harmonized_to,p.p_viirs,p.p_uncertainty,p.detect_f1,p.cell_column,p.cell_row,p.cell_area_km2,p.cell_wkt,p.frp_group_viirs_eq_mw].map(csvCell).join(',')+'\r\n';
}
function fail(message,status=400) { throw Object.assign(Error(message),{status}); }
/** Validates a common historical request without assuming a harmonization counting method. */
function historyQuery(input) {
  if (!input || !['archive','snapshot'].includes(input.source)) fail('Choose source archive or snapshot.');
  if (input.viewport) fail('Use country or area for historical queries; map viewport is not a search filter.');
  if (input.sensor && !['ALL','MODIS','VIIRS','Harmonized'].includes(input.sensor)) fail('Unknown sensor.');
  let q;
  try { q=validateQuery({...input,platform:input.source==='archive'?(input.platform||'ALL'):'ALL'},['Terra','Aqua','T','A','SNPP','N20','N21'],'observations'); } catch(error) { fail(error.message); }
  if(input.source==='archive'&&input.sensor&&input.sensor!=='ALL'){const expected=['Terra','Aqua','T','A'].includes(q.platform)?'MODIS':q.platform==='ALL'?null:'VIIRS';if(input.sensor!==expected)fail('Archive sensor must match the selected platform. Choose one platform or use ALL sources.');}
  if (q.selectedDay) q.startDate=q.endDate=q.selectedDay;
  return {...q,source:input.source,sensor:input.sensor||'ALL',expectedVersion:input.expectedVersion};
}
function snapshotRows(collection,q) {
  const from=Date.parse(q.startDate+'T00:00:00Z'),to=Date.parse(q.endDate+'T00:00:00Z')+86400000;
  return collection.features.filter(f=>{
    const t=Date.parse(f.properties.observed_at_utc||'');
    return t>=from&&t<to&&(q.sensor==='ALL'||f.properties.satellite===q.sensor)&&countryContains(q.country,...f.geometry.coordinates)&&contains(q.area,...f.geometry.coordinates);
  });
}
function aggregates(features) {
  const days=new Map();
  for(const f of features){
    const date=f.properties.observed_at_utc.slice(0,10),p=f.properties;
    const b=days.get(date)||{date,count:0,frpSum:0,frpCount:0,maxFrp:null};b.count++;
    const v=p.satellite==='Harmonized'?p.normalized_frp:p.raw_frp;
    if(typeof v==='number'&&Number.isFinite(v)&&v>=0){b.frpSum+=v;b.frpCount++;b.maxFrp=Math.max(b.maxFrp??0,v);}
    days.set(date,b);
  }
  const daily=[...days.values()].sort((a,b)=>a.date.localeCompare(b.date));
  const group=length=>{const map=new Map();for(const d of daily){const key=d.date.slice(0,length),b=map.get(key)||{date:key,count:0,frpSum:0,frpCount:0,maxFrp:null};b.count+=d.count;b.frpSum+=d.frpSum;b.frpCount+=d.frpCount;if(d.maxFrp!==null)b.maxFrp=Math.max(b.maxFrp??0,d.maxFrp);map.set(key,b);}return [...map.values()];};
  return {daily,monthly:group(7),yearly:group(4)};
}
/** Registers the model-independent historical query and complete-search CSV endpoints. */
function registerHistoryRoutes(app,{archiveService,loadSnapshot,maxExportRows=250000}) {
  async function selection(input,signal){
    const q=historyQuery(input);
    if(q.source==='archive'){
      if(!archiveService)fail('Local archive unavailable. Import the test archive or configure a snapshot source.',503);
      const metadata={source:'raw NASA FIRMS test archive',version:archiveService.version,coverage:'unknown',metric_definition:'record count; raw sensors are not equivalent activity measures',scope:'entire matching search'};
      if(q.expectedVersion&&q.expectedVersion!==metadata.version)fail('Dataset version changed. Refresh the search before exporting.',409);
      return {q,metadata,page:cursor=>archiveService.query('observations',{...q,cursor},signal),summary:()=>archiveService.query('summary',q,signal)};
    }
    const collection=await loadSnapshot();
    const metadata={...collection.metadata,source:collection.metadata?.source_name||collection.metadata?.source||'snapshot',version:collection.metadata?.version||createHash('sha256').update(JSON.stringify(collection)).digest('hex').slice(0,24),coverage:collection.metadata?.coverage||'unknown',metric_definition:'record count; harmonization comparability not validated by the web service',scope:'entire matching search within the published snapshot'};
    if(q.expectedVersion&&q.expectedVersion!==metadata.version)fail('Dataset version changed. Refresh the search before exporting.',409);
    const rows=snapshotRows(collection,q);
    return {q,metadata,page:async cursor=>({features:rows.slice(cursor,cursor+10000),total:rows.length,nextCursor:cursor+10000<rows.length?cursor+10000:null}),summary:async()=>aggregates(rows)};
  }
  for(const kind of ['query','export.csv']) app.post(`/api/v1/history/${kind}`,async(req,res)=>{
    const controller=new AbortController();res.on('close',()=>{if(!res.writableEnded)controller.abort();});
    try{
      const selected=await selection(req.body,controller.signal);
      const page=await selected.page(selected.q.cursor);
      if(kind==='query')return res.set('Cache-Control','no-store').json({metadata:selected.metadata,query:selected.q,total:page.total,features:page.features,nextCursor:page.nextCursor,aggregates:await selected.summary()});
      if(page.total>maxExportRows)fail(`This search has ${page.total} records; CSV exports support up to ${maxExportRows}. Choose a smaller region or date range.`,413);
      res.set({'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="prometheus-search.csv"','Cache-Control':'no-store','X-Dataset-Version':selected.metadata.version,'X-Export-Rows':String(page.total),'Access-Control-Expose-Headers':'X-Dataset-Version, X-Export-Rows'});
      res.write('\uFEFF'+COLUMNS.join(',')+'\r\n');
      // Exports always start at zero, independently of the map's current page.
      let current=selected.q.cursor===0?page:await selected.page(0);
      while(true){
        for(const f of current.features){if(controller.signal.aborted)return;if(!res.write(csvRow(f,selected.metadata)))await new Promise((resolve,reject)=>{const drain=()=>{cleanup();resolve();},abort=()=>{cleanup();reject(Error('Export cancelled.'));},cleanup=()=>{res.off('drain',drain);controller.signal.removeEventListener('abort',abort);};res.once('drain',drain);controller.signal.addEventListener('abort',abort,{once:true});});}
        if(current.nextCursor===null)break;
        current=await selected.page(current.nextCursor);
      }
      res.end();
    }catch(error){if(res.headersSent)return res.destroy();res.status(error.status||503).json({error:error.status?error.message:'Historical source unavailable. Retry after the next successful publication.'});}
  });
}
module.exports={registerHistoryRoutes,historyQuery,csvCell,snapshotRows,aggregates};
