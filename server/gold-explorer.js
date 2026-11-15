const { solarTime } = require('./modis-csv');

/** Projects verified Gold records without treating model scores as satellite confidence. */
function goldExplorerFeature(row, model) {
  const utc = row.observed_at_utc, solar = solarTime(utc, row.longitude);
  return { type: 'Feature', id: row.observation_id || row.record_id, geometry: { type: 'Point', coordinates: [row.longitude, row.latitude] }, properties: {
    satellite: model ? 'Harmonized' : row.sensor, platform: row.satellite || row.sensor,
    country_iso3: 'MAR',
    raw_frp: model ? null : row.frp_mw, normalized_frp: model ? row.frp_cell_mw ?? null : null,
    observed_at_utc: utc, acq_time_utc: utc.slice(11, 16), local_solar_date: solar.date, local_solar_time: solar.time,
    confidence: model ? 'Not supplied' : row.confidence || 'Not supplied',
    ...(row.confidence_percent != null && !model ? { confidence_percent: row.confidence_percent } : {}),
    ...(model ? { record_unit: 'model_candidate', harmonization_score: row.harmonization_score, model_version: row.model_version,
      model_verification_status: row.gold_provenance?.model_verification_status || null } : { product_version: row.version }),
  } };
}
module.exports = { goldExplorerFeature };
