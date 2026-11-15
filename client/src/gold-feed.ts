import type { FireCollection, SensorFilter } from './analytics-model.ts';

/** Starts with no records so connection failures cannot introduce worldwide demo points. */
export function emptyGoldCollection(): FireCollection {
  return { type: 'FeatureCollection', features: [], metadata: { source: 'harmonized', gold: true, gold_sensor: 'Harmonized', has_harmonized: true,
    source_name: 'Azure Gold · Morocco', country_iso3: 'MAR', delivery_format: 'azure-gold', record_unit: 'model_candidate' } };
}

/** Rejects wrong-source responses before they can replace the Morocco dataset. */
export function validateGoldPage(collection: FireCollection, sensor: SensorFilter, snapshot?: string) {
  const meta = collection.metadata;
  if (!meta.gold || meta.country_iso3 !== 'MAR' || meta.gold_sensor !== sensor || !meta.gold_snapshot || snapshot && snapshot !== meta.gold_snapshot ||
    !Number.isSafeInteger(meta.gold_pages) || !meta.gold_pages || meta.gold_pages > 100 || !Number.isSafeInteger(meta.total_features) || meta.total_features! > 250000 ||
    collection.features.some(feature => feature.properties.country_iso3 !== 'MAR' || !feature.properties.observed_at_utc || feature.properties.observed_at_utc.startsWith('2026-'))) {
    throw Error('The API did not return a verified Morocco Gold dataset.');
  }
}
