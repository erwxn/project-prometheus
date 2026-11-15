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
    harmonization_score?: number;
    prediction_status?: string;
    time_precision?: string;
  };
}

// Missing data stays empty; no generated observations are shown in this study.
export const FALLBACK_FIRES: FireFeature[] = [];

// Raw sensor views use measured FRP; harmonized estimates use normalized FRP.
export function getDisplayFRP(feature: FireFeature): number {
  return feature.properties.satellite.toLowerCase().includes('harmonized')
    ? feature.properties.normalized_frp ?? 0 : feature.properties.raw_frp ?? 0;
}
