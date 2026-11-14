import { validateArea } from './area-selection.ts';
import { dateRangeError } from './analytics-engine.ts';
import { countryBoundaries } from './country-filter.ts';
import type { DashboardFilters } from './analytics-model';

export interface SharedExplore {
  filters: DashboardFilters;
  camera: { longitude:number; latitude:number; zoom:number; pitch:number; bearing:number } | null;
  platform?: string;
  dataset: string;
  version?: string;
  timeline?: { scope:'day'|'file'; basis:'utc'|'solar'; cursorMinute:number; allHours:boolean; windowStart:number|null };
}
export function shareExplore(base: string, value: SharedExplore) {
  const url = new URL('/', base);
  url.searchParams.set('view', JSON.stringify(value));
  return url.href;
}
export function readSharedExplore(search: string): SharedExplore | null {
  try {
    const raw = new URLSearchParams(search).get('view');
    if (!raw || raw.length > 24000) return null;
    const value = JSON.parse(raw) as SharedExplore, f = value.filters;
    if (!f || typeof f.startDate!=='string' || typeof f.endDate!=='string' || dateRangeError(f.startDate,f.endDate) || !['ALL','MODIS','VIIRS','Harmonized'].includes(f.sensor) || !['detections','mean-frp'].includes(f.metric) || f.area && validateArea(f.area) || f.country && (typeof f.country!=='string'||!Object.hasOwn(countryBoundaries,f.country))) return null;
    if (f.selectedDay && (!/^\d{4}-\d{2}-\d{2}$/.test(f.selectedDay) || f.selectedDay<f.startDate || f.selectedDay>f.endDate)) return null;
    if (typeof value.dataset !== 'string' || value.dataset.length>300 || value.platform && !['Terra','Aqua','T','A','SNPP','N20','N21','ALL'].includes(value.platform)) return null;
    if (value.camera) {
      const c=value.camera;
      if (![c.longitude,c.latitude,c.zoom,c.pitch,c.bearing].every(Number.isFinite) || Math.abs(c.longitude)>180 || Math.abs(c.latitude)>90 || c.zoom< -2 || c.zoom>22 || c.pitch<0 || c.pitch>85 || Math.abs(c.bearing)>360) return null;
    }
    if (value.timeline) { const t=value.timeline; if (!['day','file'].includes(t.scope)||!['utc','solar'].includes(t.basis)||typeof t.allHours!=='boolean'||!Number.isFinite(t.cursorMinute)||t.cursorMinute<0||t.cursorMinute>60000000||t.windowStart!==null&&(!Number.isFinite(t.windowStart)||Math.abs(t.windowStart)>8640000000000000)) return null; }
    return value;
  } catch { return null; }
}
