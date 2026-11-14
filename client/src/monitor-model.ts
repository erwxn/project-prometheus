import type { FireFeature } from './fire-data';
import { DAY } from './timeline.ts';

/** Selects a rolling UTC day ending at the supplied wall-clock or playback instant. */
export function recentObservations(features: FireFeature[], end: number) {
  return features.filter(f => {
    const time = Date.parse(f.properties.observed_at_utc || '');
    return Number.isFinite(time) && time >= end - DAY && time <= end;
  });
}

/** Returns the previous hour within a frozen 24-hour playback window. */
export function playbackObservations(features: FireFeature[], anchor: number, minutes: number) {
  const end = anchor - DAY + minutes * 60000;
  return recentObservations(features, anchor).filter(f => {
    const time = Date.parse(f.properties.observed_at_utc!);
    return time >= Math.max(anchor - DAY, end - 3600000) && time <= end;
  });
}
