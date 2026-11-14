const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const { gzipSync } = require('node:zlib');
const { loadModisCsv, parseModisCsv } = require('./modis-csv');
const testData = require('./test-data').openTestData();
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 5000;

// Vercel overwrites X-Forwarded-For with the originating client IP.
// Trust only the platform's final proxy hop; direct local servers trust none.
if (process.env.VERCEL) app.set('trust proxy', 1);

// Security & utility middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Express rate limiter: 100 requests per 15 minutes window
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  // Use Vercel's canonical X-Forwarded-For, not the alternate Forwarded header.
  validate: { forwardedHeader: !process.env.VERCEL },
  message: {
    status: 429,
    message: 'Too many requests from this IP, please try again after 15 minutes.'
  }
});
app.use(limiter);

/**
 * Diurnal Mock Fire Dataset
 * Harmonizes MODIS (1km footprint, ~10:30 & ~22:30 Terra, ~13:30 & ~01:30 Aqua)
 * and VIIRS (375m footprint, ~13:30 & ~01:30 Suomi-NPP / NOAA-20)
 * Spans 00:00 through 23:00 Local Solar Time (LST) across global fire regimes.
 */
const FIRES_DATASET = [
  // Hour 00 (Midnight smoldering)
  {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [149.82, -33.52] },
    properties: {
      satellite: 'Harmonized',
      raw_frp: 28.4,
      normalized_frp: 52.1,
      acq_time_utc: '14:02',
      local_solar_time: '00:01',
      confidence: 'nominal'
    }
  },
  {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [-5.802, 35.759] },
    properties: {
      satellite: 'Harmonized',
      raw_frp: 18.2,
      normalized_frp: 38.5,
      acq_time_utc: '00:23',
      local_solar_time: '00:40',
      confidence: 'nominal'
    }
  },

  // Hour 01 (Aqua / VIIRS Night overpasses)
  {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [-121.46, 39.75] },
    properties: {
      satellite: 'VIIRS',
      raw_frp: 62.5,
      normalized_frp: 74.0,
      acq_time_utc: '09:20',
      local_solar_time: '01:14',
      confidence: 'high'
    }
  },
  {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [-54.96, -11.85] },
    properties: {
      satellite: 'MODIS',
      raw_frp: 22.0,
      normalized_frp: 48.6,
      acq_time_utc: '04:45',
      local_solar_time: '01:30',
      confidence: 'nominal'
    }
  },
  {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [113.92, -2.21] },
    properties: {
      satellite: 'Harmonized',
      raw_frp: 35.1,
      normalized_frp: 58.2,
      acq_time_utc: '17:45',
      local_solar_time: '01:45',
      confidence: 'high'
    }
  },

  // Hour 02
  {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [23.65, -11.23] },
    properties: {
      satellite: 'Harmonized',
      raw_frp: 24.3,
      normalized_frp: 46.8,
      acq_time_utc: '00:35',
      local_solar_time: '02:10',
      confidence: 'nominal'
    }
  },
  {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [-5.620, 35.530] },
    properties: {
      satellite: 'Harmonized',
      raw_frp: 16.5,
      normalized_frp: 32.1,
      acq_time_utc: '02:22',
      local_solar_time: '02:45',
      confidence: 'low'
    }
  },

  // Hour 03
  {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [129.74, 62.03] },
    properties: {
      satellite: 'Harmonized',
      raw_frp: 19.8,
      normalized_frp: 35.4,
      acq_time_utc: '18:20',
      local_solar_time: '03:15',
      confidence: 'nominal'
    }
  },
  {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [-120.15, 38.92] },
    properties: {
      satellite: 'Harmonized',
      raw_frp: 31.0,
      normalized_frp: 54.0,
      acq_time_utc: '11:30',
      local_solar_time: '03:40',
      confidence: 'nominal'
    }
  },

  // Hour 04
  {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [19.23, -8.45] },
    properties: {
      satellite: 'Harmonized',
      raw_frp: 21.0,
      normalized_frp: 41.5,
      acq_time_utc: '02:45',
      local_solar_time: '04:12',
      confidence: 'low'
    }
  },
  {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [150.31, -33.71] },
    properties: {
      satellite: 'Harmonized',
      raw_frp: 27.8,
      normalized_frp: 49.3,
      acq_time_utc: '18:10',
      local_solar_time: '04:35',
      confidence: 'nominal'
    }
  },

  // Hour 05
  {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [-56.09, -9.87] },
    properties: {
      satellite: 'Harmonized',
      raw_frp: 23.4,
      normalized_frp: 47.0,
      acq_time_utc: '08:45',
      local_solar_time: '05:20',
      confidence: 'nominal'
    }
  },
  {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [-5.320, 35.170] },
    properties: {
      satellite: 'Harmonized',
      raw_frp: 18.0,
      normalized_frp: 36.2,
      acq_time_utc: '05:35',
      local_solar_time: '05:50',
      confidence: 'low'
    }
  },

  // Hour 06 (Dawn ignition / embers)
  {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [132.85, -12.65] },
    properties: {
      satellite: 'Harmonized',
      raw_frp: 38.6,
      normalized_frp: 64.2,
      acq_time_utc: '21:15',
      local_solar_time: '06:10',
      confidence: 'nominal'
    }
  },
  {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [103.12, -1.95] },
    properties: {
      satellite: 'Harmonized',
      raw_frp: 32.7,
      normalized_frp: 57.0,
      acq_time_utc: '23:25',
      local_solar_time: '06:45',
      confidence: 'nominal'
    }
  },

  // Hour 07
  {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [-118.82, 36.45] },
    properties: {
      satellite: 'Harmonized',
      raw_frp: 39.5,
      normalized_frp: 68.3,
      acq_time_utc: '15:10',
      local_solar_time: '07:15',
      confidence: 'nominal'
    }
  },
  {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [27.45, -7.89] },
    properties: {
      satellite: 'Harmonized',
      raw_frp: 34.0,
      normalized_frp: 60.5,
      acq_time_utc: '05:20',
      local_solar_time: '07:35',
      confidence: 'nominal'
    }
  },

  // Hour 08
  {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [-62.86, -8.76] },
    properties: {
      satellite: 'Harmonized',
      raw_frp: 41.2,
      normalized_frp: 72.8,
      acq_time_utc: '12:15',
      local_solar_time: '08:20',
      confidence: 'nominal'
    }
  },
  {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [-4.420, 36.720] },
    properties: {
      satellite: 'Harmonized',
      raw_frp: 30.5,
      normalized_frp: 55.4,
      acq_time_utc: '08:30',
      local_solar_time: '08:45',
      confidence: 'nominal'
    }
  },

  // Hour 09
  {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [148.91, -36.21] },
    properties: {
      satellite: 'Harmonized',
      raw_frp: 52.0,
      normalized_frp: 88.5,
      acq_time_utc: '23:10',
      local_solar_time: '09:15',
      confidence: 'high'
    }
  },
  {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [114.33, 58.12] },
    properties: {
      satellite: 'Harmonized',
      raw_frp: 44.8,
      normalized_frp: 76.2,
      acq_time_utc: '01:40',
      local_solar_time: '09:40',
      confidence: 'nominal'
    }
  },

  // Hour 10 (Terra Morning Overpass window ~10:30)
  {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [-5.802, 35.759] },
    properties: {
      satellite: 'MODIS',
      raw_frp: 45.2,
      normalized_frp: 113.0,
      acq_time_utc: '10:30',
      local_solar_time: '10:37',
      confidence: 'high'
    }
  },
  {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [-121.46, 39.75] },
    properties: {
      satellite: 'MODIS',
      raw_frp: 58.0,
      normalized_frp: 128.4,
      acq_time_utc: '18:35',
      local_solar_time: '10:30',
      confidence: 'high'
    }
  },
  {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [23.65, -11.23] },
    properties: {
      satellite: 'MODIS',
      raw_frp: 49.3,
      normalized_frp: 116.7,
      acq_time_utc: '08:50',
      local_solar_time: '10:45',
      confidence: 'high'
    }
  },

  // Hour 11 (Diurnal ramp-up)
  {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [-54.96, -11.85] },
    properties: {
      satellite: 'Harmonized',
      raw_frp: 75.0,
      normalized_frp: 155.0,
      acq_time_utc: '14:40',
      local_solar_time: '11:15',
      confidence: 'high'
    }
  },
  {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [-5.620, 35.530] },
    properties: {
      satellite: 'Harmonized',
      raw_frp: 68.4,
      normalized_frp: 142.2,
      acq_time_utc: '11:25',
      local_solar_time: '11:45',
      confidence: 'high'
    }
  },

  // Hour 12 (Mid-day solar zenith)
  {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [19.23, -8.45] },
    properties: {
      satellite: 'Harmonized',
      raw_frp: 95.0,
      normalized_frp: 198.5,
      acq_time_utc: '10:40',
      local_solar_time: '12:10',
      confidence: 'high'
    }
  },
  {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [150.31, -33.71] },
    properties: {
      satellite: 'Harmonized',
      raw_frp: 110.2,
      normalized_frp: 220.0,
      acq_time_utc: '02:15',
      local_solar_time: '12:35',
      confidence: 'high'
    }
  },

  // Hour 13 (Afternoon Aqua & VIIRS 375m peak window ~13:30)
  {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [-120.15, 38.92] },
    properties: {
      satellite: 'VIIRS',
      raw_frp: 185.0,
      normalized_frp: 245.0,
      acq_time_utc: '21:30',
      local_solar_time: '13:30',
      confidence: 'high'
    }
  },
  {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [-5.802, 35.759] },
    properties: {
      satellite: 'VIIRS',
      raw_frp: 142.5,
      normalized_frp: 192.0,
      acq_time_utc: '13:40',
      local_solar_time: '13:32',
      confidence: 'high'
    }
  },
  {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [-56.09, -9.87] },
    properties: {
      satellite: 'Harmonized',
      raw_frp: 165.8,
      normalized_frp: 260.4,
      acq_time_utc: '17:15',
      local_solar_time: '13:45',
      confidence: 'high'
    }
  },

  // Hour 14 (Maximum Diurnal Fire Peak: High Temp & Lowest RH)
  {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [-121.46, 39.75] },
    properties: {
      satellite: 'Harmonized',
      raw_frp: 215.0,
      normalized_frp: 310.0,
      acq_time_utc: '22:45',
      local_solar_time: '14:20',
      confidence: 'high'
    }
  },
  {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [132.85, -12.65] },
    properties: {
      satellite: 'Harmonized',
      raw_frp: 190.4,
      normalized_frp: 285.6,
      acq_time_utc: '05:10',
      local_solar_time: '14:35',
      confidence: 'high'
    }
  },
  {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [-7.930, 37.019] },
    properties: {
      satellite: 'Harmonized',
      raw_frp: 135.2,
      normalized_frp: 210.0,
      acq_time_utc: '14:50',
      local_solar_time: '14:48',
      confidence: 'high'
    }
  },

  // Hour 15 (Active fire propagation)
  {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [27.45, -7.89] },
    properties: {
      satellite: 'Harmonized',
      raw_frp: 178.0,
      normalized_frp: 265.0,
      acq_time_utc: '13:20',
      local_solar_time: '15:15',
      confidence: 'high'
    }
  },
  {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [-62.86, -8.76] },
    properties: {
      satellite: 'Harmonized',
      raw_frp: 155.6,
      normalized_frp: 242.0,
      acq_time_utc: '19:35',
      local_solar_time: '15:40',
      confidence: 'high'
    }
  },

  // Hour 16 (Late afternoon thermal peak decay)
  {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [-118.82, 36.45] },
    properties: {
      satellite: 'Harmonized',
      raw_frp: 145.0,
      normalized_frp: 218.0,
      acq_time_utc: '00:15',
      local_solar_time: '16:15',
      confidence: 'high'
    }
  },
  {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [103.12, -1.95] },
    properties: {
      satellite: 'Harmonized',
      raw_frp: 120.4,
      normalized_frp: 185.0,
      acq_time_utc: '09:25',
      local_solar_time: '16:45',
      confidence: 'high'
    }
  },

  // Hour 17 (Dusk transition)
  {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [-5.320, 35.170] },
    properties: {
      satellite: 'Harmonized',
      raw_frp: 88.5,
      normalized_frp: 145.0,
      acq_time_utc: '17:25',
      local_solar_time: '17:10',
      confidence: 'nominal'
    }
  },
  {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [148.91, -36.21] },
    properties: {
      satellite: 'Harmonized',
      raw_frp: 98.2,
      normalized_frp: 156.4,
      acq_time_utc: '07:20',
      local_solar_time: '17:35',
      confidence: 'high'
    }
  },

  // Hour 18 (Sunset)
  {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [-54.96, -11.85] },
    properties: {
      satellite: 'Harmonized',
      raw_frp: 72.0,
      normalized_frp: 124.0,
      acq_time_utc: '21:45',
      local_solar_time: '18:15',
      confidence: 'nominal'
    }
  },
  {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [114.33, 58.12] },
    properties: {
      satellite: 'Harmonized',
      raw_frp: 64.0,
      normalized_frp: 108.5,
      acq_time_utc: '10:30',
      local_solar_time: '18:40',
      confidence: 'nominal'
    }
  },

  // Hour 19
  {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [-120.15, 38.92] },
    properties: {
      satellite: 'Harmonized',
      raw_frp: 58.5,
      normalized_frp: 98.0,
      acq_time_utc: '03:15',
      local_solar_time: '19:15',
      confidence: 'nominal'
    }
  },
  {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [23.65, -11.23] },
    properties: {
      satellite: 'Harmonized',
      raw_frp: 50.4,
      normalized_frp: 86.2,
      acq_time_utc: '17:40',
      local_solar_time: '19:45',
      confidence: 'nominal'
    }
  },

  // Hour 20
  {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [19.23, -8.45] },
    properties: {
      satellite: 'Harmonized',
      raw_frp: 42.0,
      normalized_frp: 74.0,
      acq_time_utc: '18:45',
      local_solar_time: '20:10',
      confidence: 'nominal'
    }
  },
  {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [-5.802, 35.759] },
    properties: {
      satellite: 'Harmonized',
      raw_frp: 38.0,
      normalized_frp: 68.0,
      acq_time_utc: '20:15',
      local_solar_time: '20:38',
      confidence: 'nominal'
    }
  },

  // Hour 21
  {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [150.31, -33.71] },
    properties: {
      satellite: 'Harmonized',
      raw_frp: 39.4,
      normalized_frp: 69.2,
      acq_time_utc: '11:10',
      local_solar_time: '21:15',
      confidence: 'nominal'
    }
  },
  {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [-56.09, -9.87] },
    properties: {
      satellite: 'Harmonized',
      raw_frp: 34.5,
      normalized_frp: 62.0,
      acq_time_utc: '00:45',
      local_solar_time: '21:40',
      confidence: 'nominal'
    }
  },

  // Hour 22 (Terra Night overpass ~22:30 window)
  {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [-121.46, 39.75] },
    properties: {
      satellite: 'MODIS',
      raw_frp: 36.0,
      normalized_frp: 68.5,
      acq_time_utc: '06:30',
      local_solar_time: '22:25',
      confidence: 'high'
    }
  },
  {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [132.85, -12.65] },
    properties: {
      satellite: 'MODIS',
      raw_frp: 40.2,
      normalized_frp: 75.0,
      acq_time_utc: '13:40',
      local_solar_time: '22:35',
      confidence: 'high'
    }
  },

  // Hour 23 (Late night smoldering)
  {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [129.74, 62.03] },
    properties: {
      satellite: 'Harmonized',
      raw_frp: 26.5,
      normalized_frp: 48.0,
      acq_time_utc: '14:20',
      local_solar_time: '23:15',
      confidence: 'nominal'
    }
  },
  {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [-5.620, 35.530] },
    properties: {
      satellite: 'Harmonized',
      raw_frp: 22.1,
      normalized_frp: 42.0,
      acq_time_utc: '23:30',
      local_solar_time: '23:45',
      confidence: 'nominal'
    }
  }
];

// Import once at startup. An explicitly configured bad path fails visibly rather than serving demos.
const csvPath = process.env.FIRES_CSV_PATH || path.join(__dirname, 'data', 'modis.csv');
const imported = process.env.FIRES_CSV_PATH || fs.existsSync(csvPath) ? loadModisCsv(csvPath) : null;
const activeData = (testData && testData.collection()) || imported || { type: 'FeatureCollection', metadata: { source: 'demo', source_name: 'Illustrative demo dataset', total_features: FIRES_DATASET.length }, features: FIRES_DATASET };
if (imported) console.log(`Loaded ${imported.features.length} MODIS observations (${imported.metadata.rejected_rows} rejected rows)`);
app.get('/api/v1/fires', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(activeData);
});

app.get('/api/v1/fires/test/catalog', (req, res) => res.json(testData ? testData.catalog : {temporary:false,total:0,partitions:[]}));
app.get('/api/v1/fires/test', (req, res) => {
  if (!testData) return res.status(404).json({error:'Temporary test index is not loaded.'});
  const result = testData.collection(req.query.platform, req.query.month, Number(req.query.page || 0));
  if (!result) return res.status(400).json({error:'Choose a valid test platform, month, and page.'});
  res.set('Cache-Control','no-store');
  res.json(result);
});

// Temporary testing endpoint. Parse in memory and return to the uploader only;
// never replace activeData, write files, or retain a shared session dataset.
app.post('/api/v1/fires/upload', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  if (process.env.ENABLE_CSV_UPLOAD === 'false') return res.status(404).json({ error: 'CSV testing uploads are disabled.' });
  if (!req.is('text/csv')) return res.status(415).json({ error: 'Upload a MODIS CSV file using text/csv.' });
  next();
}, express.text({ type: 'text/csv', limit: '3mb' }), (req, res) => {
  if (typeof req.body !== 'string' || !req.body.trim()) return res.status(400).json({ error: 'The CSV is empty. Choose a file containing MODIS observations.' });
  try {
    const filename = decodeURIComponent(req.get('X-CSV-Filename') || 'uploaded-modis.csv').split(/[\\/]/).pop().replace(/[\x00-\x1f\x7f]/g, '').slice(0, 180);
    const collection = parseModisCsv(req.body, filename || 'uploaded-modis.csv');
    if (collection.features.length > 50000) return res.status(422).json({ error: 'CSV contains more than 50,000 detections. Use a smaller file for testing.' });
    collection.metadata.uploaded = true;
    res.vary('Accept-Encoding');
    if (req.acceptsEncodings('gzip')) {
      res.set('Content-Encoding', 'gzip').type('json').send(gzipSync(JSON.stringify(collection)));
    } else res.json(collection);
  } catch (error) {
    const detail = error.code ? 'Malformed CSV. Check quoted values and the number of columns in each row.' : error.message;
    res.status(400).json({ error: detail });
  }
});

// Endpoint: Health Check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'MODIS-VIIRS Harmonizer API'
  });
});

// Endpoint: Sample Harmonized Fire Anomalies
app.get('/api/v1/fires/sample', (req, res) => {
  res.json({
    type: 'FeatureCollection',
    metadata: {
      description: 'Project Prometheus — Harmonized MODIS and VIIRS Fire Hotspots',
      resolution_bridge: 'MODIS 1km -> VIIRS 375m Spatial Harmonization & Diurnal Cycle Gap Fill',
      total_features: FIRES_DATASET.length
    },
    features: FIRES_DATASET
  });
});

// Endpoint: Diurnal Filtered Fire Anomalies (?hour=HH)
app.get('/api/v1/fires/diurnal', (req, res) => {
  const { hour } = req.query;

  if (hour !== undefined && hour !== null && hour !== '') {
    const formattedHour = String(hour).trim().padStart(2, '0');
    if (!/^([01]?\d|2[0-3])$/.test(String(hour).trim())) return res.status(400).json({ error: 'hour must be an integer from 0 to 23' });
    const filtered = activeData.features.filter((feature) => {
      const lst = feature.properties && feature.properties.local_solar_time;
      if (!lst) return false;
      return lst.startsWith(formattedHour);
    });

    return res.json({
      type: 'FeatureCollection',
      metadata: activeData.metadata,
      hour: formattedHour,
      total_features: filtered.length,
      features: filtered
    });
  }

  // If no hour query is provided, return all diurnal features
  res.json({
    type: 'FeatureCollection',
    metadata: activeData.metadata,
    total_features: activeData.features.length,
    features: activeData.features
  });
});

// Return actionable JSON for body-parser upload errors instead of an HTML page.
app.use((error, req, res, next) => {
  if (req.path !== '/api/v1/fires/upload') return next(error);
  const oversized = error.type === 'entity.too.large';
  res.status(oversized ? 413 : 400).json({ error: oversized ? 'CSV exceeds the 3 MB testing limit. Choose a smaller file.' : 'Could not read this CSV. Save it as UTF-8 and try again.' });
});

// Standalone execution check
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`MODIS-VIIRS Harmonizer API listening on port ${PORT}`);
  });
}

module.exports = app;
