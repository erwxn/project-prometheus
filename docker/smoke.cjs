const assert = require('node:assert/strict');

(async () => {
  const base = 'http://web';
  for (const route of ['/', '/explore/', '/analytics/', '/monitor/', '/about/']) {
    const response = await fetch(base + route);
    assert.equal(response.status, 200, route);
    const html = await response.text();
    assert.match(html, /<html/i, route);
    const asset = html.match(/(?:src|href)="(\/assets\/[^\"]+)"/);
    assert.ok(asset, `${route}: built asset`);
    assert.equal((await fetch(base + asset[1])).status, 200);
  }
  const health = await fetch(base + '/health');
  assert.equal(health.status, 200);
  assert.equal((await health.json()).status, 'ok');
  const response = await fetch(base + '/api/v1/fires');
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.type, 'FeatureCollection');
  assert.ok(data.features.length > 0, 'bundled observations');
  assert.equal(data.metadata.preview, true, 'historical preview remains labeled');
  console.log(`DOCKER_SMOKE_OK: routes, assets, health, ${data.features.length} preview features`);
})().catch(error => { console.error(error); process.exitCode = 1; });
