/** Reads archive JSON while explaining stale servers and incorrect API routing. */
export async function readArchiveResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error('The archive API returned a web page instead of data. Restart the API with npm run server:dev after pulling updates. If deployed, check that /api routes reach the latest backend.');
  }
  let data;
  try { data = await response.json(); }
  catch { throw new Error('The archive API returned invalid JSON. Retry the archive request; if it persists, restart the API server.'); }
  if (!response.ok) throw new Error(typeof data?.error === 'string' ? data.error : `Archive query failed (HTTP ${response.status}).`);
  return data as T;
}
