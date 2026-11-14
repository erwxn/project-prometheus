const { parse } = require('csv-parse/sync');
const { solarTime } = require('./modis-csv');

const defaults = {
  latitude: ['latitude', 'lat'], longitude: ['longitude', 'lon', 'lng'],
  observed_at_utc: ['observed_at_utc', 'timestamp', 'timestamp_utc'],
  harmonized_frp_mw: ['harmonized_frp_mw', 'harmonized_frp', 'normalized_frp'],
  id: ['id', 'observation_id'], model_version: ['model_version'],
};

/** Converts complete tabular snapshots to the explorer's observation contract. */
async function adaptHarmonized(buffer, { format = 'csv', columns = {}, jsonPath = '', maxRows = 100000 } = {}) {
  let rows;
  let headers;
  if (format === 'csv') {
    let count = 0;
    rows = parse(buffer, { bom: true, trim: true, skip_empty_lines: true, on_record: row => {
      if (++count > maxRows) throw new Error('Snapshot exceeds the observation limit.');
      return row;
    }, columns: names => {
      headers = names;
      return names;
    } });
  } else if (format === 'json') {
    rows = JSON.parse(buffer.toString('utf8'));
    if (jsonPath) for (const key of jsonPath.split('.')) rows = rows?.[key];
    if (!Array.isArray(rows)) throw new Error('JSON must contain an array of observation records.');
  } else if (format === 'parquet') {
    const { parquetMetadata, parquetReadObjects } = await import('hyparquet');
    const { compressors } = await import('hyparquet-compressors');
    const file = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    const metadata = parquetMetadata(file);
    if (BigInt(metadata.num_rows) > BigInt(maxRows)) throw new Error('Snapshot exceeds the observation limit.');
    headers = metadata.schema.filter(field => field.type !== undefined).map(field => field.name);
    rows = await parquetReadObjects({ file, compressors });
  } else throw new Error('Unsupported feed format; use csv, parquet, or json.');
  if (rows.length > maxRows) throw new Error('Snapshot exceeds the observation limit.');
  headers ??= rows.length ? Object.keys(rows[0]) : Object.keys(defaults).map(key => columns[key] || key);
  const normalize = key => key.trim().toLowerCase();
  if (new Set(headers.map(normalize)).size !== headers.length) throw new Error('Duplicate column names.');
  const fieldMap = {};
  for (const [field, aliases] of Object.entries(defaults)) {
    const candidates = columns[field] ? [columns[field]] : aliases;
    fieldMap[field] = candidates.map(normalize).find(name => headers.some(h => normalize(h) === name));
    if (!fieldMap[field] && !['id', 'model_version'].includes(field)) throw new Error(`Missing harmonized field: ${field}.`);
  }
  const ids = new Set();
  const features = rows.map((original, index) => {
    if (!original || typeof original !== 'object' || Array.isArray(original)) throw new Error(`Invalid record at row ${index + 1}.`);
    const row = Object.fromEntries(Object.entries(original).map(([key, value]) => [normalize(key), value]));
    const value = field => row[fieldMap[field]];
    const numeric = field => {
      const input = value(field);
      if (typeof input === 'bigint') return Number.isSafeInteger(Number(input)) ? Number(input) : NaN;
      if (!['string', 'number'].includes(typeof input) || String(input).trim() === '') return NaN;
      return Number(input);
    };
    const lat = numeric('latitude'), lon = numeric('longitude'), frp = numeric('harmonized_frp_mw');
    const inputTime = value('observed_at_utc');
    const timestamp = inputTime instanceof Date ? inputTime.toISOString() : String(inputTime);
    const ms = Date.parse(timestamp);
    if (!Number.isFinite(lat) || Math.abs(lat) > 90 || !Number.isFinite(lon) || Math.abs(lon) > 180 ||
        !Number.isFinite(frp) || frp < 0 || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(timestamp) ||
        !Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 10) !== timestamp.slice(0, 10)) {
      throw new Error(`Invalid coordinates, FRP, or UTC timestamp at row ${index + 1}.`);
    }
    const utc = new Date(ms).toISOString();
    const id = String(value('id') ?? `${utc}:${lon}:${lat}`);
    if (!id.trim() || ids.has(id)) throw new Error(`Missing or duplicate identifier at row ${index + 1}.`);
    ids.add(id);
    const solar = solarTime(utc, lon);
    return { type: 'Feature', id, geometry: { type: 'Point', coordinates: [lon, lat] }, properties: {
      satellite: 'Harmonized', raw_frp: null, normalized_frp: frp,
      observed_at_utc: utc, acq_date: utc.slice(0, 10), acq_time_utc: utc.slice(11, 16),
      local_solar_date: solar.date, local_solar_time: solar.time,
      confidence: 'Not provided', model_version: value('model_version') == null ? null : String(value('model_version')),
    } };
  });
  const times = features.map(f => f.properties.observed_at_utc).sort();
  return { type: 'FeatureCollection', metadata: { source: 'harmonized', sensor: 'Harmonized',
    total_features: features.length, input_rows: rows.length, rejected_rows: 0, has_harmonized: true,
    observed_from: times[0] ?? null, observed_to: times.at(-1) ?? null,
    local_solar_dates: [...new Set(features.map(f => f.properties.local_solar_date))].sort(),
    solar_time_basis: 'Local mean solar time (UTC + longitude / 15 hours)',
  }, features };
}

module.exports = { adaptHarmonized };
