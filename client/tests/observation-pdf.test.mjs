import { test } from 'node:test';
import assert from 'node:assert/strict';
import { observationPdf } from '../src/observation-pdf.ts';
import { feature } from './analytics-fixtures.mjs';
const options = { source: 'Test dataset', scope: 'Loaded map observations', period: '2025-01-01', sensor: 'MODIS', region: 'All locations', generatedAt: new Date('2025-01-01T00:00:00Z') };
test('PDF exports empty selections as valid reports and paginates all selected observations', () => {
  const empty = observationPdf([], options);
  assert.match(empty.output(), /^%PDF-/);
  assert.equal(empty.getNumberOfPages(), 1);
  const report = observationPdf(Array.from({length:150}, () => feature('2025-01-01', 0)), options);
  assert.ok(report.getNumberOfPages() > 3);
  assert.equal(report.output('blob').type, 'application/pdf');
});
