import type { FireFeature } from './fire-data.ts';
export const csvColumns=['id','observed_at_utc','latitude','longitude','sensor','platform','raw_frp_mw','harmonized_frp_mw','confidence','model_version','product_version','dataset_version','source'];
/** Escapes CSV while preserving negative numeric coordinates and neutralizing formulas in text. */
export function csvCell(value: unknown): string {
  if(value===null||value===undefined)return '';
  let text=String(value);
  if(typeof value==='string'&&/^\s*[=+\-@]/.test(text))text="'"+text;
  return /[",\r\n]/.test(text)?`"${text.replaceAll('"','""')}"`:text;
}
/** Exports all matching loaded snapshot rows, not the visible map page. */
export function snapshotCsv(features: FireFeature[], source: string, version: string) {
  return '\uFEFF'+[csvColumns.join(','),...features.map(f=>{const p=f.properties;return [f.id,p.observed_at_utc,f.geometry.coordinates[1],f.geometry.coordinates[0],p.satellite,p.platform,p.raw_frp,p.normalized_frp,p.confidence,p.model_version,p.product_version,version,source].map(csvCell).join(',');})].join('\r\n')+'\r\n';
}
