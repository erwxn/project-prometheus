const { createHash } = require('node:crypto');
const { GoogleAuth } = require('google-auth-library');
const { pathToFileURL } = require('node:url');
const fs = require('node:fs/promises');
const { adaptHarmonized } = require('./harmonized-data');

/** Reads deployment-owned feed configuration; credentials never reach the browser. */
function feedConfig(env = process.env) {
  if (!env.HARMONIZED_SOURCE && !env.HARMONIZED_LOCAL_FILE) return null;
  if (env.HARMONIZED_SOURCE && env.HARMONIZED_LOCAL_FILE) throw Error('Choose either HARMONIZED_SOURCE or HARMONIZED_LOCAL_FILE.');
  const source = env.HARMONIZED_LOCAL_FILE ? pathToFileURL(require('node:path').resolve(env.HARMONIZED_LOCAL_FILE)) : new URL(env.HARMONIZED_SOURCE);
  if (source.protocol === 'gs:' && (!source.hostname || source.pathname.length < 2 || source.search || source.hash)) throw new Error('Use gs://bucket/object for the published snapshot.');
  if (!(env.HARMONIZED_LOCAL_FILE && source.protocol === 'file:') && !['https:', 'gs:'].includes(source.protocol) && !(source.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(source.hostname))) {
    throw new Error('HARMONIZED_SOURCE must use HTTPS, gs://, or local HTTP.');
  }
  if (source.username || source.password) throw new Error('Use HARMONIZED_API_TOKEN instead of URL credentials.');
  const format = env.HARMONIZED_FORMAT || source.pathname.split('.').at(-1).toLowerCase();
  if (!['csv', 'parquet', 'json', 'zip'].includes(format)) throw new Error('Set HARMONIZED_FORMAT to csv, parquet, json, or zip.');
  const positive = (name, fallback) => {
    const value = Number(env[name] ?? fallback);
    if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer.`);
    return value;
  };
  const columns = JSON.parse(env.HARMONIZED_COLUMNS || '{}');
  if (!columns || typeof columns !== 'object' || Array.isArray(columns) || Object.values(columns).some(value => typeof value !== 'string')) throw new Error('HARMONIZED_COLUMNS must map canonical fields to column names.');
  return { source, format, columns, jsonPath: env.HARMONIZED_JSON_PATH || '',
    label: env.HARMONIZED_SOURCE_NAME || (env.HARMONIZED_LOCAL_FILE ? 'Local harmonized delivery preview' : 'Team harmonized results'), token: env.HARMONIZED_API_TOKEN,
    ttl: positive('HARMONIZED_REFRESH_SECONDS', 60) * 1000,
    timeout: positive('HARMONIZED_TIMEOUT_SECONDS', 15) * 1000,
    maxBytes: positive('HARMONIZED_MAX_BYTES', 32 * 1024 * 1024), maxRows: positive('HARMONIZED_MAX_ROWS', 100000),
  };
}

/** Caches validated snapshots per process and shares concurrent refresh requests. */
function createHarmonizedFeed(config, { fetchImpl = fetch, getAccessToken, now = Date.now } = {}) {
  const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/devstorage.read_only'] });
  let snapshot, inFlight, nextCheck = 0, etag, modified, lastSuccess, lastFailure = false;
  async function refresh() {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeout);
    try {
      let url = config.source.href;
      const headers = {};
      if (config.source.protocol === 'file:') {
        const file = await fs.open(config.source);
        try {
          if ((await file.stat()).size > config.maxBytes) throw Error('Feed exceeds byte limit.');
          const chunks = [];
          let bytes = 0;
          for await (const chunk of file.createReadStream({ autoClose: false, signal: controller.signal })) {
            bytes += chunk.length;
            if (bytes > config.maxBytes) throw Error('Feed exceeds byte limit.');
            chunks.push(chunk);
          }
          const buffer = Buffer.concat(chunks);
          const candidate = await adaptHarmonized(buffer, config);
          Object.assign(candidate.metadata, { source_name: config.label, preview: true, version: createHash('sha256').update(buffer).digest('hex') });
          snapshot = candidate;
          lastSuccess = new Date(now()).toISOString();
          lastFailure = false;
          return;
        } finally { await file.close(); }
      }
      if (config.source.protocol === 'gs:') {
        const token = await Promise.race([
          getAccessToken ? getAccessToken() : auth.getAccessToken(),
          new Promise((_, reject) => controller.signal.addEventListener('abort', () => reject(new Error('Authentication timed out.')), { once: true })),
        ]);
        if (controller.signal.aborted) throw new Error('Feed request timed out.');
        headers.Authorization = `Bearer ${token}`;
        url = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(config.source.hostname)}/o/${encodeURIComponent(decodeURIComponent(config.source.pathname.slice(1)))}?alt=media`;
      } else if (config.token) headers.Authorization = `Bearer ${config.token}`;
      if (etag) headers['If-None-Match'] = etag;
      else if (modified) headers['If-Modified-Since'] = modified;
      const response = await fetchImpl(url, { headers, signal: controller.signal, redirect: 'error' });
      if (response.status !== 304) {
        if (!response.ok) throw new Error('Upstream request failed.');
        if (Number(response.headers.get('content-length')) > config.maxBytes) throw new Error('Feed exceeds byte limit.');
        const chunks = [];
        let bytes = 0;
        for await (const chunk of response.body) {
          bytes += chunk.length;
          if (bytes > config.maxBytes) { controller.abort(); throw new Error('Feed exceeds byte limit.'); }
          chunks.push(chunk);
        }
        const buffer = Buffer.concat(chunks);
        const candidate = await adaptHarmonized(buffer, config);
        candidate.metadata.source_name = config.label;
        candidate.metadata.version = createHash('sha256').update(buffer).digest('hex');
        snapshot = candidate;
        etag = response.headers.get('etag');
        modified = response.headers.get('last-modified');
      } else if (!snapshot) throw new Error('No cached snapshot for upstream response.');
      lastSuccess = new Date(now()).toISOString();
      lastFailure = false;
    } catch {
      // Do not log upstream errors: URLs and provider errors may contain credentials.
      lastFailure = true;
    } finally {
      clearTimeout(timeout);
      nextCheck = now() + config.ttl;
    }
  }
  return { async get() {
    if (now() >= nextCheck) {
      inFlight ??= refresh().finally(() => { inFlight = null; });
      await inFlight;
    } else if (inFlight) await inFlight;
    if (!snapshot) throw new Error('Harmonized feed unavailable; no validated snapshot has been loaded.');
    return { ...snapshot, metadata: { ...snapshot.metadata, feed_status: lastFailure ? 'stale' : 'current', last_checked_at: lastSuccess } };
  } };
}

module.exports = { feedConfig, createHarmonizedFeed };
