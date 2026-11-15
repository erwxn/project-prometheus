const { unzipSync } = require('fflate');
const { adaptHarmonized, readTable } = require('./harmonized-data');

function number(value, name, min = 0, max = Infinity) {
  const result = typeof value === 'number' || typeof value === 'bigint' || (typeof value === 'string' && value.trim()) ? Number(value) : NaN;
  if (!Number.isFinite(result) || result < min || result > max) throw Error(`Invalid delivery field: ${name}.`);
  return result;
}
function text(value, name) {
  if (typeof value !== 'string' || !value.trim()) throw Error(`Missing delivery field: ${name}.`);
  return value;
}
function base(row, latitude, longitude, frp, id) {
  return { id, latitude, longitude, harmonized_frp_mw: frp, observed_at_utc: row.time_utc, model_version: row.model_version ?? null };
}
function annotate(collection, rows, unit, extra) {
  const dates = rows.map(row => new Date(row.time_utc).toISOString()).sort();
  Object.assign(collection.metadata, {
    delivery_format: 'modis-viirs-v1', record_unit: unit, input_rows: rows.length,
    observed_from: dates[0] ?? null, observed_to: dates.at(-1) ?? null,
    regions: [...new Set(rows.map(row => row.region).filter(Boolean))],
    coverage_status: 'unknown',
    limitations: ['Day passes only in the supplied example.', 'Fires missed by MODIS are not recovered.',
      'Cell FRP is indicative; fire-group totals are the reliable quantity.',
      'Missing dates and absent partitions do not establish zero fire activity.'],
    ...extra,
  });
  return collection;
}

/** Counts only model-selected cells; probabilities are not observed confidence percentages. */
async function adaptCells(rows) {
  rows = rows.map(row => ({ ...row,
    detect_f1: typeof row.detect_f1 === 'string' && /^(true|false)$/i.test(row.detect_f1) ? row.detect_f1.toLowerCase() === 'true' : row.detect_f1,
    p_viirs: number(row.p_viirs, 'p_viirs', 0, 1),
    p_uncertainty: number(row.p_uncertainty, 'p_uncertainty', 0, 1),
    cell_area_km2: number(row.cell_area_km2, 'cell_area_km2', Number.MIN_VALUE),
    frp_group_viirs_eq_mw: number(row.frp_group_viirs_eq_mw, 'frp_group_viirs_eq_mw'),
  }));
  const ids = new Set(), groups = new Map();
  const normalized = rows.map(row => {
    const fire = text(row.fire_id, 'fire_id');
    const column = number(row.cell_column, 'cell_column', -Infinity);
    const gridRow = number(row.cell_row, 'cell_row', -Infinity);
    if (!Number.isSafeInteger(column) || !Number.isSafeInteger(gridRow)) throw Error('Cell grid coordinates must be integers.');
    const id = `${fire}:${column}:${gridRow}`;
    if (ids.has(id)) throw Error('Duplicate delivery cell identifier.');
    ids.add(id);
    number(row.p_viirs, 'p_viirs', 0, 1);
    number(row.p_uncertainty, 'p_uncertainty', 0, 1);
    number(row.cell_area_km2, 'cell_area_km2', Number.MIN_VALUE);
    if (typeof row.detect_f1 !== 'boolean') throw Error('detect_f1 must be a boolean.');
    const groupFrp = number(row.frp_group_viirs_eq_mw, 'frp_group_viirs_eq_mw');
    if (groups.has(fire) && groups.get(fire) !== groupFrp) throw Error('Inconsistent fire-group FRP.');
    groups.set(fire, groupFrp);
    return base(row, row.cell_lat, row.cell_lon, number(row.frp_cell_mw, 'frp_cell_mw'), id);
  });
  // Validate even below-threshold rows before accepting any part of a publication.
  const collection = await adaptHarmonized(Buffer.from(JSON.stringify(normalized)), { format: 'json', maxRows: rows.length });
  const allFeatures = collection.features;
  collection.features = allFeatures.filter((feature, index) => {
    const row = rows[index];
    Object.assign(feature.properties, {
      record_unit: 'predicted_cell', fire_id: row.fire_id, region: row.region,
      source_sensor: row.sensor, harmonized_to: row.harmonized_to,
      p_viirs: row.p_viirs, p_uncertainty: row.p_uncertainty, detect_f1: row.detect_f1,
      cell_column: Number(row.cell_column), cell_row: Number(row.cell_row),
      cell_area_km2: row.cell_area_km2, cell_wkt: row.wkt,
      frp_group_viirs_eq_mw: row.frp_group_viirs_eq_mw,
      confidence: typeof row.confidence === 'string' ? row.confidence : 'Not provided',
    });
    return row.detect_f1;
  });
  return annotate(collection, rows, 'predicted_cell', {
    total_features: collection.features.length, candidate_cells: rows.length,
    predicted_cells: collection.features.length, fire_groups: groups.size,
    group_frp_total_mw: [...groups.values()].reduce((a, b) => a + b, 0),
    selection_rule: 'detect_f1 = true (producer-supplied model threshold)',
    excluded_below_threshold: rows.length - collection.features.length,
  });
}

/** Adapts the alternative group table without duplicating group FRP per cell. */
async function adaptGroups(rows) {
  const normalized = rows.map(row => base(row, row.lat, row.lon, number(row.frp_viirs_eq_mw, 'frp_viirs_eq_mw'), text(row.fire_id, 'fire_id')));
  const collection = await adaptHarmonized(Buffer.from(JSON.stringify(normalized)), { format: 'json', maxRows: rows.length });
  collection.features.forEach((feature, index) => Object.assign(feature.properties, {
    record_unit: 'fire_group', fire_id: rows[index].fire_id, region: rows[index].region,
  }));
  return annotate(collection, rows, 'fire_group', { fire_groups: rows.length });
}

/** Reads one publication without extracting paths or counting the flat and partitioned copies twice. */
async function readDelivery(buffer, options = {}) {
  const maxBytes = options.maxBytes ?? 32 * 1024 * 1024;
  if (buffer.length > maxBytes) throw Error('Delivery exceeds byte limit.');
  let total = 0, entries = 0;
  const seen = new Set();
  const files = unzipSync(buffer, { filter: entry => {
    if (++entries > 4096 || !Number.isSafeInteger(entry.originalSize) || (total += entry.originalSize) > maxBytes) throw Error('Delivery exceeds expanded byte or file limit.');
    if (entry.name.includes('\\') || entry.name.startsWith('/') || entry.name.split('/').includes('..')) throw Error('Unsafe delivery path.');
    if (seen.has(entry.name)) throw Error('Duplicate delivery ZIP entry.');
    seen.add(entry.name);
    return !entry.name.endsWith('/');
  } });
  const names = Object.keys(files);
  // A ZIP may wrap its delivery in a single directory.
  const flat = names.filter(name => /(?:^|\/)cells_frp_\d{4}\.parquet$/.test(name)).sort();
  const partitions = names.filter(name => /(?:^|\/)cells\/year=\d{4}\/month=\d{2}\/[^/]+\.parquet$/.test(name)).sort();
  if (!flat.length && !partitions.length) throw Error('Delivery has no cell Parquet tables. Publish fires_YYYY.parquet directly for group mode.');
  const years = flat.map(name => name.match(/cells_frp_(\d{4})/)[1]);
  if (new Set(years).size !== years.length) throw Error('Duplicate flat cell tables for a year.');
  const selected = [...flat, ...partitions.filter(name => !years.includes(name.match(/year=(\d{4})/)[1]))];
  const rows = [];
  for (const name of selected) {
    const table = await readTable(Buffer.from(files[name]), { format: 'parquet', maxRows: (options.maxRows ?? 100000) - rows.length });
    rows.push(...table.rows);
  }
  const collection = await adaptCells(rows);
  collection.metadata.delivery_tables = selected;
  collection.metadata.validation = {};
  for (const name of names.filter(name => /(?:^|\/)accuracy_\d{4}\.json$/.test(name))) {
    collection.metadata.validation[name.split('/').at(-1)] = JSON.parse(Buffer.from(files[name]).toString('utf8'));
  }
  return collection;
}

module.exports = { adaptCells, adaptGroups, readDelivery };
