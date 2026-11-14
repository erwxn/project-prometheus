import { DAY, MINUTE } from './timeline.ts';

/** Anchors archive playback to the applied period rather than the current map page. */
export function archivePeriod(startDate: string, endDate: string) {
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${endDate}T00:00:00Z`) + DAY;
  return { start, durationMinutes: (end - start) / MINUTE };
}

/** Keeps map pagination and viewport refreshes from resetting archive playback. */
export function explorerDatasetKey(archive: boolean, platform: string | undefined, startDate: string, endDate: string, observations: unknown) {
  return archive ? `${platform}:${startDate}:${endDate}` : observations;
}
