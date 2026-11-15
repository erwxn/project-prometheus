import {useDashboard} from './dashboard-context';

/** Separates dataset provenance and whole-selection totals from the loaded map page. */
export function DatasetStatus(){
 const {state,archive,selected}=useDashboard();
 const meta=state.collection.metadata;
 const version=archive.active?archive.data?.metadata?.version:meta.version;
 const methods=[...new Set(archive.active ? archive.data?.daily.flatMap(day=>day.methods)||[] : state.collection.features.map(f=>f.properties.model_version||f.properties.product_version).filter(Boolean))];
 return <section className="dataset-status-panel" aria-label="Dataset provenance and coverage"><dl>
 <div><dt>Source</dt><dd>{archive.active?'Raw NASA FIRMS test archive':meta.source_name||meta.source}</dd></div>
 <div><dt>Dataset version</dt><dd>{version||'Not supplied'}{version&&<small>Identifies the current publication or local archive.</small>}</dd></div>
 <div><dt>Publication state</dt><dd>{archive.active?'Local test index':meta.feed_status==='stale'?'Update failed; showing the last valid publication':meta.feed_status==='current'?'Current accepted publication':'Loaded snapshot; refresh status not supplied'}</dd></div>
 <div><dt>Coverage</dt><dd>{Array.isArray(meta.coverage)&&meta.coverage.length?'Coverage metadata supplied; availability varies by date and source.':'Unknown. Missing records do not mean zero activity.'}</dd></div>
 <div><dt>Search versus map</dt><dd>{archive.active?`${archive.data?.totals.count.toLocaleString()??'Pending'} records in the full selection; ${state.collection.features.length.toLocaleString()} loaded on this map page.`:`${selected.length.toLocaleString()} matching records in the loaded snapshot.`}</dd></div>
 <div><dt>Product / model</dt><dd>{methods.length?`${methods.slice(0,3).join(', ')}${methods.length>3?` and ${methods.length-3} more`:''}`:'Not supplied'}<small>Counts describe records. Cross-sensor activity comparability is not validated by this interface.</small></dd></div>
 </dl></section>;
}
