/** Builds inclusive UTC date shortcuts from the newest available observation, never an invented live date. */
export function explorePreset(latest: string | null | undefined, days: number) {
  if (!latest || !Number.isInteger(days) || days < 1) return null;
  const end = Date.parse(latest);
  if (!Number.isFinite(end)) return null;
  const midnight = Math.floor(end / 86400000) * 86400000;
  return { startDate: new Date(midnight - (days - 1) * 86400000).toISOString().slice(0, 10), endDate: new Date(midnight).toISOString().slice(0, 10) };
}
