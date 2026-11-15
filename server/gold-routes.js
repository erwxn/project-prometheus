const ENDPOINTS = {
  '/api/fire-observations': 'morocco_fire_observations',
  '/api/model-predictions': 'morocco_harmonized_predictions',
  '/api/harmonization-daily-summary': 'morocco_harmonization_daily_summary',
  '/api/harmonized-fire-groups': 'morocco_harmonized_fire_groups',
  '/api/model-evaluations': 'morocco_model_evaluation',
  '/api/model-evaluations/metrics': 'morocco_model_evaluation',
  '/api/producer-reported-evaluations': 'morocco_producer_reported_evaluation',
};
const { gzipSync } = require('node:zlib');

/** Registers isolated Gold endpoints and returns only static, sanitized public errors. */
function registerGoldRoutes(app, { service } = {}) {
  const pending = new Map();
  let comparison;
  async function resolve(country = 'MAR') {
    if (!['MAR', 'DZA'].includes(country)) { const { GoldError } = await import('../deploy/backend/gold_reader.mjs'); throw new GoldError(400); }
    if (service) return service;
    if (!pending.has(country)) pending.set(country, import('./gold-service.mjs').then(module => module.createGoldService({ country })).catch(() => { pending.delete(country); throw Error('Gold unavailable.'); }));
    return pending.get(country);
  }
  for (const route of ['/api/gold/catalog', '/api/gold/explorer', '/api/comparisons/morocco-algeria', ...Object.keys(ENDPOINTS), '/api/producer-reported-evaluations/metrics']) {
    app.get(route, async (req, res) => {
      res.set('Cache-Control', 'no-store');
      try {
        const country = req.query.country === undefined ? 'MAR' : req.query.country;
        const gold = await resolve(country);
        if (route === '/api/comparisons/morocco-algeria') comparison ??= import('./gold-service.mjs').then(module => module.createGoldComparisonService());
        const result = route === '/api/comparisons/morocco-algeria' ? await (await comparison)(req.query) : route === '/api/gold/explorer' ? await gold.explorer(req.query) : route === '/api/gold/catalog' ? await gold.catalog(req.query)
          : route === '/api/producer-reported-evaluations/metrics' ? await gold.producerMetrics(req.query)
          : await gold.query(ENDPOINTS[route], req.query, route.endsWith('/metrics'));
        const { publicGoldValue, sha256 } = await import('../deploy/backend/gold_reader.mjs');
        if (route === '/api/gold/explorer') {
          const etag = `"${result.metadata.version}:${result.metadata.gold_page}"`;
          res.set('ETag', etag);
          if (req.get('If-None-Match') === etag) { res.status(304).end(); return; }
        }
        const body = JSON.stringify(publicGoldValue(result));
        if (route !== '/api/gold/explorer') {
          const etag = '"' + sha256(Buffer.from(body)) + '"';
          res.set('ETag', etag);
          if (req.get('If-None-Match') === etag) { res.status(304).end(); return; }
        }
        if (route === '/api/gold/explorer') {
          const compressed = gzipSync(body);
          if (compressed.length > 3 * 1024 * 1024) return res.status(503).json({ error: 'Gold map publication exceeds the hosted response limit.', code: 'GOLD_503' });
          res.set('Content-Encoding', 'gzip').vary('Accept-Encoding').type('json').send(compressed);
          return;
        }
        if (Buffer.byteLength(body) > 4 * 1024 * 1024) return res.status(400).json({ error: 'Gold response too large. Reduce page_size.', code: 'GOLD_400' });
        res.type('json').send(body);
      } catch (error) {
        const status = error?.constructor?.name === 'GoldError' && [400, 409].includes(error.status) ? error.status : 503;
        const messages = { 400: 'Invalid Gold query.', 409: 'Gold snapshot changed. Reload the catalog and retry.', 503: 'Gold data unavailable. Check backend access and retry.' };
        if (status === 503) res.set('Retry-After', '30');
        res.status(status).json({ error: messages[status], code: `GOLD_${status}` });
      }
    });
  }
}

module.exports = { registerGoldRoutes };
