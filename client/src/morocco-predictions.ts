import type { FeatureCollection, MultiPolygon } from 'geojson';

export type ForecastCells = FeatureCollection<MultiPolygon, { probability: number }>;
type EvaluationScore = { detection_cell_days: number; mean_log_loss: number; top_decile_capture: number };

export interface MoroccoPredictions {
  version: 1;
  bounds: [number, number, number, number];
  cells: MultiPolygon['coordinates'][];
  monthly: Record<string, number[]>;
  evaluation: {
    source: string;
    training_end_by_year: Record<string, number>;
    grid_size_m: number;
    chosen_model: 'annual' | 'seasonal';
    test_2025: Record<'uniform' | 'annual' | 'seasonal', EvaluationScore>;
  };
}

const percent = new Intl.NumberFormat(undefined, { style: 'percent', maximumFractionDigits: 3 });
export const probabilityLabel = (value: number) => percent.format(value);

export const predictionBands = [
  { limit: .0001, color: [81, 177, 188, 155], label: 'Below 0.01%' },
  { limit: .0005, color: [117, 122, 208, 180], label: '0.01% to below 0.05%' },
  { limit: .001, color: [171, 87, 167, 200], label: '0.05% to below 0.1%' },
  { limit: Infinity, color: [228, 131, 52, 220], label: '0.1% and above' },
] as const;

export function predictionDates(data: MoroccoPredictions): string[] {
  return Object.keys(data.monthly).sort().reverse();
}

export function preferredPredictionDate(dates: string[], utcMonth: string): string {
  return dates.find(date => date <= utcMonth) ?? dates.at(-1) ?? '';
}

export function predictionCells(data: MoroccoPredictions, date: string): ForecastCells {
  const features: ForecastCells['features'] = [];
  (data.monthly[date] ?? []).forEach((value, index) => {
    const coordinates = data.cells[index];
    if (coordinates && Number.isFinite(value) && value >= 0 && value <= 1_000_000) {
      features.push({
        type: 'Feature', id: index,
        geometry: { type: 'MultiPolygon', coordinates },
        properties: { probability: value / 1_000_000 },
      });
    }
  });
  return { type: 'FeatureCollection', features };
}
