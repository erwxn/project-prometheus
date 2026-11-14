/** Returns a bounded page of observations without dropping records beyond the first 100. */
export function observationPage<T>(records: readonly T[], requestedPage: number) {
  const size = 20;
  const page = Math.max(0, Math.min(Math.floor(requestedPage), Math.max(0, Math.ceil(records.length / size) - 1)));
  const start = page * size;
  return { page, start, rows: records.slice(start, start + size) };
}
