const test = require('node:test');
const assert = require('node:assert/strict');
const { goldExplorerFeature } = require('./gold-explorer');

test('Gold map exposes decision only for the frozen model artifact', () => {
  const row = { observed_at_utc: '2014-01-01T12:00:00Z', latitude: 35, longitude: -5,
    model_sha256: '206bd8ff48c7d5efcd798917351a4b3843affe90e92b9d11a755e5d6ee852d40' };
  const decision = (overrides, model = true) => goldExplorerFeature({ ...row, ...overrides }, model).properties.detect_f1;
  assert.equal(decision({ harmonization_score: 0.1 }), false);
  assert.equal(decision({ harmonization_score: 0.16686241493815074 }), true);
  assert.equal(decision({ harmonization_score: 0.9, model_sha256: 'different' }), undefined);
  assert.equal(decision({ harmonization_score: null }), undefined);
  assert.equal(decision({ harmonization_score: 0.9 }, false), undefined);
});
