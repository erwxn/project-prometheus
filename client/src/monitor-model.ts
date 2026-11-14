import type { FireFeature } from './fire-data';
import type { FireMetadata } from './analytics-model.ts';
import { DAY, MINUTE, matchesDataset } from './timeline.ts';

export const acquisitionTime = (feature: FireFeature) => Date.parse(feature.properties.observed_at_utc || '');

export function detectionKey(feature: FireFeature) {
  const { satellite, platform, observed_at_utc } = feature.properties;
  return JSON.stringify([feature.id, satellite, platform, observed_at_utc, feature.geometry.coordinates]);
}

export function newestDetections(features: FireFeature[]) {
  return [...features].sort((a, b) => acquisitionTime(b) - acquisitionTime(a)).slice(0, 20);
}

export function detectionAge(feature: FireFeature, cursor: number) {
  const minutes = Math.max(0, Math.floor((cursor - acquisitionTime(feature)) / MINUTE));
  if (!minutes) return 'Less than 1 min ago';
  if (minutes < 60) return `${minutes} min ago`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min ago`;
}

export function measuredPower(feature: FireFeature) {
  const power = feature.properties.raw_frp;
  return !matchesDataset(feature, 'Harmonized') && typeof power === 'number' && Number.isFinite(power) && power >= 0 ? power : null;
}

export function monitorFeedStatus(metadata: FireMetadata | undefined, loading: boolean, error: string) {
  if (error || metadata?.feed_status === 'stale') return 'Update failed';
  if (loading) return 'Connecting';
  return metadata?.live === true ? 'Near-real-time feed' : 'Historical snapshot';
}

/** Selects a rolling UTC day ending at the supplied wall-clock or playback instant. */
export function recentObservations(features: FireFeature[], end: number) {
  return features.filter(f => {
    const time = acquisitionTime(f);
    return Number.isFinite(time) && time >= end - DAY && time <= end;
  });
}

/** Returns the previous hour within a frozen 24-hour playback window. */
export function playbackObservations(features: FireFeature[], anchor: number, minutes: number) {
  const end = anchor - DAY + minutes * 60000;
  return recentObservations(features, anchor).filter(f => {
    const time = acquisitionTime(f);
    return time >= Math.max(anchor - DAY, end - 3600000) && time <= end;
  });
}
