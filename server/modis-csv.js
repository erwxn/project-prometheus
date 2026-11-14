const fs = require('node:fs');
const path = require('node:path');
const { parse } = require('csv-parse/sync');

// Local MEAN solar time, not apparent solar time: UTC + longitude / 15 hours.
function solarTime(utcTimestamp, longitude) {
  const shifted = new Date(Date.parse(utcTimestamp) + Math.round(longitude * 4 * 60000));
  return { date: shifted.toISOString().slice(0, 10), time: shifted.toISOString().slice(11, 16) };
}

function parseModisCsv(text, sourceName = 'MODIS CSV') {
  const required = ['latitude', 'longitude', 'acq_date', 'acq_time', 'satellite', 'confidence', 'frp'];
  const rows = parse(text, { bom: true, columns: headers => {
    const names = headers.map(h => h.trim().toLowerCase());
    for (const field of required) if (!names.includes(field)) throw new Error(`Missing CSV column: ${field}`);
    if (new Set(names).size !== names.length) throw new Error('Duplicate CSV columns');
    return names;
  }, skip_empty_lines: true, trim: true });
  if (!rows.length) throw new Error('CSV contains no observations');
  let rejected = 0;
  const features = [];
  for (const [index, row] of rows.entries()) {
    const latitude = Number(row.latitude), longitude = Number(row.longitude), frp = Number(row.frp);
    const confidence = Number(row.confidence);
    const time = /^\d{1,4}$/.test(row.acq_time) ? row.acq_time.padStart(4, '0') : '';
    const hour = Number(time.slice(0, 2)), minute = Number(time.slice(2));
    const timestamp = `${row.acq_date}T${time.slice(0, 2)}:${time.slice(2)}:00.000Z`;
    const milliseconds = Date.parse(timestamp);
    const platform = { T: 'Terra', A: 'Aqua', Terra: 'Terra', Aqua: 'Aqua' }[row.satellite];
    if ([row.latitude, row.longitude, row.frp, row.confidence].some(v => v === '') ||
        !Number.isFinite(latitude) || Math.abs(latitude) > 90 || !Number.isFinite(longitude) || Math.abs(longitude) > 180 ||
        !Number.isFinite(frp) || frp < 0 || !Number.isFinite(confidence) || confidence < 0 || confidence > 100 ||
        !time || hour > 23 || minute > 59 || !/^\d{4}-\d{2}-\d{2}$/.test(row.acq_date) ||
        !Number.isFinite(milliseconds) || new Date(milliseconds).toISOString().slice(0, 10) !== row.acq_date || !platform) {
      rejected++; continue;
    }
    const solar = solarTime(timestamp, longitude);
    features.push({ type: 'Feature', id: `modis-${index + 1}`, geometry: { type: 'Point', coordinates: [longitude, latitude] },
      properties: { satellite: 'MODIS', platform, raw_frp: frp, normalized_frp: null,
        acq_date: row.acq_date, acq_time_utc: `${time.slice(0, 2)}:${time.slice(2)}`, observed_at_utc: timestamp,
        local_solar_date: solar.date, local_solar_time: solar.time, confidence: String(confidence), confidence_percent: confidence,
        daynight: row.daynight || null, product_version: row.version || null }
    });
  }
  if (!features.length) throw new Error('CSV contains no valid MODIS observations');
  const timestamps = features.map(f => f.properties.observed_at_utc).sort();
  return { type: 'FeatureCollection', metadata: { source: 'csv', source_name: sourceName, sensor: 'MODIS',
    total_features: features.length, rejected_rows: rejected, input_rows: rows.length,
    observed_from: timestamps[0], observed_to: timestamps[timestamps.length - 1],
    solar_time_basis: 'Local mean solar time (UTC + longitude / 15 hours)',
    local_solar_dates: [...new Set(features.map(f => f.properties.local_solar_date))].sort(),
    has_harmonized: false }, features };
}

function loadModisCsv(filePath) {
  return parseModisCsv(fs.readFileSync(filePath, 'utf8'), path.basename(filePath));
}
module.exports = { parseModisCsv, loadModisCsv, solarTime };
