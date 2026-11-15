// Production uses Vercel's same-origin API routes; Vite dev talks to Express.
export const API_BASE = import.meta.env?.VITE_API_BASE || (import.meta.env?.PROD ? '' : 'http://localhost:5000');

export interface FireFeature {
  type: string;
  id?: string | number;
  geometry: {
    type: string;
    coordinates: [number, number];
  };
  properties: {
    satellite: string;
    raw_frp: number | null;
    normalized_frp: number | null;
    platform?: string;
    observed_at_utc?: string;
    local_solar_date?: string;
    confidence_percent?: number;
    acq_time_utc: string;
    local_solar_time: string;
    confidence: string;
    model_version?: string | null;
    product_version?: string | null;
    method_id?: string;
    record_unit?: 'predicted_cell' | 'fire_group' | 'model_candidate';
    country_iso3?: string;
    gold_verified?: boolean;
    harmonization_score?: number | null;
    model_verification_status?: string | null;
    fire_id?: string;
    region?: string;
    source_sensor?: string;
    harmonized_to?: string;
    p_viirs?: number;
    p_uncertainty?: number;
    detect_f1?: boolean;
    cell_column?: number;
    cell_row?: number;
    cell_area_km2?: number;
    cell_wkt?: string;
    frp_group_viirs_eq_mw?: number;
  };
}

const MOCK_FALLBACK: FireFeature[] = [
  // Hour 00
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

  // Hour 01
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
    geometry: { type: 'Point', coordinates: [-5.62, 35.53] },
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
    geometry: { type: 'Point', coordinates: [-5.32, 35.17] },
    properties: {
      satellite: 'Harmonized',
      raw_frp: 18.0,
      normalized_frp: 36.2,
      acq_time_utc: '05:35',
      local_solar_time: '05:50',
      confidence: 'low'
    }
  },

  // Hour 06
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
    geometry: { type: 'Point', coordinates: [-4.42, 36.72] },
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

  // Hour 10 (Terra Morning Overpass)
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

  // Hour 11
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
    geometry: { type: 'Point', coordinates: [-5.62, 35.53] },
    properties: {
      satellite: 'Harmonized',
      raw_frp: 68.4,
      normalized_frp: 142.2,
      acq_time_utc: '11:25',
      local_solar_time: '11:45',
      confidence: 'high'
    }
  },

  // Hour 12
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

  // Hour 13 (VIIRS & Aqua Afternoon Peak)
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

  // Hour 14 (Diurnal Maximum Peak)
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
    geometry: { type: 'Point', coordinates: [-7.93, 37.019] },
    properties: {
      satellite: 'Harmonized',
      raw_frp: 135.2,
      normalized_frp: 210.0,
      acq_time_utc: '14:50',
      local_solar_time: '14:48',
      confidence: 'high'
    }
  },

  // Hour 15
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

  // Hour 16
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

  // Hour 17
  {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [-5.32, 35.17] },
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

  // Hour 18
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

  // Hour 22 (Terra Night)
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

  // Hour 23
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
    geometry: { type: 'Point', coordinates: [-5.62, 35.53] },
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

// Additional illustrative observations around Tangier across the daily fire cycle.
// Every requested hour includes each source so offline layer comparisons are usable.
const MOROCCO_DEMO: FireFeature[] = ['02:00', '08:00', '10:30', '13:30', '17:00', '21:00'].flatMap((time, hourIndex) =>
  ['MODIS', 'VIIRS', 'Harmonized'].map((satellite, sourceIndex) => {
    const raw = [18, 42, 86, 185, 110, 27][hourIndex] + sourceIndex * 9;
    return {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [-5.86 + sourceIndex * .13 + hourIndex * .025, 35.66 - sourceIndex * .09 + hourIndex * .014] },
      properties: { satellite, raw_frp: raw, normalized_frp: Math.round(raw * 1.35 * 10) / 10,
        acq_time_utc: time, local_solar_time: time, confidence: 'nominal' }
    };
  })
);
export const FALLBACK_FIRES = [...MOCK_FALLBACK, ...MOROCCO_DEMO];

// Raw sensor views use measured FRP; harmonized estimates use normalized FRP.
export function getDisplayFRP(feature: FireFeature): number {
  return feature.properties.satellite.toLowerCase().includes('harmonized')
    ? feature.properties.normalized_frp ?? 0 : feature.properties.raw_frp ?? 0;
}
