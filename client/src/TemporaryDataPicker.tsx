import { useEffect, useState } from 'react';
import { API_BASE } from './fire-data';
import { useDashboard } from './dashboard-context';

interface Partition { sensor: string; platform: string; month: string; count: number }
export function TemporaryDataPicker() {
  const {state,loadTemporary} = useDashboard();
  const [catalog,setCatalog] = useState<{total:number;partitions:Partition[]} | null>(null);
  useEffect(() => { const controller = new AbortController(); void fetch(`${API_BASE}/api/v1/fires/test/catalog`,{signal:controller.signal}).then(r=>r.ok?r.json():null).then(data=>{if(data?.temporary) setCatalog(data);}).catch(()=>{}); return ()=>controller.abort(); }, []);
  if (!catalog) return null;
  const meta = state.collection.metadata;
  const active = catalog.partitions.find(p=>p.platform===meta.test_platform && p.month===meta.test_month) || catalog.partitions[0];
  return <div className="temporary-data-picker">
    <strong>Temporary archive test data</strong>
    <p>{catalog.total.toLocaleString()} unique observation records indexed locally. Select a platform and month; analytics describe only the loaded slice. No harmonized predictions or coverage guarantees are supplied.</p>
    <label>Test dataset<select aria-label="Test dataset" value={meta.temporary ? `${active.platform}|${active.month}` : ''} disabled={state.status==='loading'} onChange={event=>{const [platform,month]=event.target.value.split('|'); if(platform) void loadTemporary(platform,month);}}>
      <option value="" disabled>Choose archived observations</option>
      {catalog.partitions.map(p=><option key={`${p.platform}|${p.month}`} value={`${p.platform}|${p.month}`}>{p.sensor} / {p.platform} · {p.month} · {p.count.toLocaleString()} records</option>)}
    </select></label>
    {meta.temporary && <p role="status">Loaded {state.collection.features.length.toLocaleString()} of {meta.partition_total?.toLocaleString()} records for this month.{(meta.test_pages || 1)>1 && <> Page {(meta.test_page || 0)+1} of {meta.test_pages}. <button disabled={!meta.test_page || state.status==='loading'} onClick={()=>void loadTemporary(active.platform,active.month,(meta.test_page || 0)-1)}>Previous slice</button> <button disabled={(meta.test_page || 0)+1 >= (meta.test_pages || 1) || state.status==='loading'} onClick={()=>void loadTemporary(active.platform,active.month,(meta.test_page || 0)+1)}>Next slice</button> Statistics cover this page only.</>}</p>}
    <small>Removable local test index. Original ZIP files remain unchanged.</small>
  </div>;
}
