const { solarTime } = require('./modis-csv');

// Frozen delivery configuration for this exact Model B artifact.
const MODEL_B_SHA256 = '206bd8ff48c7d5efcd798917351a4b3843affe90e92b9d11a755e5d6ee852d40';
const MODEL_B_F1 = 0.16686241493815074;

/** Projects verified Gold records without treating model scores as satellite confidence. */
function goldExplorerFeature(row, model) {
  const utc = row.observed_at_utc, solar = solarTime(utc, row.longitude);
  const decision = model && row.model_sha256 === MODEL_B_SHA256 && Number.isFinite(row.harmonization_score)
    ? { detect_f1: row.harmonization_score >= MODEL_B_F1 }
    : {};
  return { type: 'Feature', id: row.observation_id || row.record_id, geometry: { type: 'Point', coordinates: [row.longitude, row.latitude] }, properties: {
    satellite: model ? 'Harmonized' : row.sensor, platform: row.satellite || row.sensor,
    country_iso3: 'MAR',
    raw_frp: model ? null : row.frp_mw, normalized_frp: model ? row.frp_cell_mw ?? null : null,
    observed_at_utc: utc, acq_time_utc: utc.slice(11, 16), local_solar_date: solar.date, local_solar_time: solar.time,
    confidence: model ? 'Not supplied' : row.confidence || 'Not supplied',
    ...(row.confidence_percent != null && !model ? { confidence_percent: row.confidence_percent } : {}),
    ...(model ? { record_unit: 'model_candidate', ...decision, harmonization_score: row.harmonization_score, model_version: row.model_version,
      model_verification_status: row.gold_provenance?.model_verification_status || null } : { product_version: row.version }),
  } };
}
module.exports = { goldExplorerFeature };
