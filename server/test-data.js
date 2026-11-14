// Optional local test data. Removing its database disables these routes/defaults.
const fs = require('node:fs');
const path = require('node:path');
const { solarTime } = require('./modis-csv');
const filename = path.join(__dirname, 'data', 'vis-test.sqlite');
function openTestData(databasePath = filename) {
  if (!fs.existsSync(databasePath)) return null;
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(databasePath, { readOnly: true });
  const cached = db.prepare("SELECT name FROM sqlite_master WHERE name='partitions'").get();
  const partitions = db.prepare(cached ? 'SELECT * FROM partitions ORDER BY month DESC,platform' : "SELECT sensor,platform,substr(date,1,7) month,count(*) count FROM observations GROUP BY platform,substr(date,1,7) ORDER BY month DESC,platform").all();
  if (!partitions.length) { db.close(); return null; }
  const total = partitions.reduce((sum, p) => sum + Number(p.count), 0);
  const preferred = partitions.find(p => p.sensor === 'MODIS') || partitions[0];
  function collection(platform = preferred.platform, month = preferred.month, page = 0) {
    const partition = partitions.find(p => p.platform === platform && p.month === month);
    if (!partition || !Number.isInteger(page) || page < 0 || page >= Math.ceil(partition.count / 50000)) return null;
    const rows = db.prepare('SELECT * FROM observations WHERE platform=? AND date>=? AND date<? ORDER BY date,time,lat,lon LIMIT 50000 OFFSET ?').all(platform, month+'-01', month+'-32', page*50000);
    const features = rows.map((r, i) => {
      const utc = `${r.date}T${r.time}:00.000Z`, solar = solarTime(utc, r.lon);
      return { type: 'Feature', id: `test-${platform}-${month}-${page}-${i}`, geometry: { type: 'Point', coordinates: [r.lon, r.lat] }, properties: { satellite: r.sensor, platform: r.platform, raw_frp: r.frp, normalized_frp: null, observed_at_utc: utc, acq_time_utc: r.time, local_solar_date: solar.date, local_solar_time: solar.time, confidence: ({l:'low',n:'nominal',h:'high'})[r.confidence] || r.confidence, ...(r.sensor === 'MODIS' ? {confidence_percent:Number(r.confidence)} : {}), product_version: r.version, source_file: r.source } };
    });
    return { type: 'FeatureCollection', metadata: { source:'csv', temporary:true, source_name:`TEMPORARY TEST · ${partition.sensor} / ${platform} · ${month}`, total_features:features.length, indexed_total:total, partition_total:partition.count, test_platform:platform, test_month:month, test_page:page, test_pages:Math.ceil(partition.count/50000), observed_from:features[0].properties.observed_at_utc, observed_to:features.at(-1).properties.observed_at_utc, has_harmonized:false }, features };
  }
  return { collection, close:()=>db.close(), catalog: { temporary:true,total,partitions,pageSize:50000 } };
}
module.exports = { openTestData };
