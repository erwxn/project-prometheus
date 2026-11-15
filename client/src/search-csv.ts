import type { FireFeature } from './fire-data.ts';
export const csvColumns=['id','observed_at_utc','latitude','longitude','sensor','platform','raw_frp_mw','harmonized_frp_mw','confidence','model_version','product_version','dataset_version','source','record_unit','fire_id','region','source_sensor','harmonized_to','p_viirs','p_uncertainty','detect_f1','cell_column','cell_row','cell_area_km2','cell_wkt','frp_group_viirs_eq_mw'];
/** Escapes CSV while preserving negative numeric coordinates and neutralizing formulas in text. */
export function csvCell(value: unknown): string {
  if(value===null||value===undefined)return '';
  let text=String(value);
  if(typeof value==='string'&&/^\s*[=+\-@]/.test(text))text="'"+text;
  return /[",\r\n]/.test(text)?`"${text.replaceAll('"','""')}"`:text;
}
/** Exports all matching loaded snapshot rows, not the visible map page. */
export function snapshotCsv(features: FireFeature[], source: string, version: string) {
  return '\uFEFF'+[csvColumns.join(','),...features.map(f=>{const p=f.properties;return [f.id,p.observed_at_utc,f.geometry.coordinates[1],f.geometry.coordinates[0],p.satellite,p.platform,p.raw_frp,p.normalized_frp,p.confidence,p.model_version,p.product_version,version,source,p.record_unit,p.fire_id,p.region,p.source_sensor,p.harmonized_to,p.p_viirs,p.p_uncertainty,p.detect_f1,p.cell_column,p.cell_row,p.cell_area_km2,p.cell_wkt,p.frp_group_viirs_eq_mw].map(csvCell).join(',');})].join('\r\n')+'\r\n';
}
