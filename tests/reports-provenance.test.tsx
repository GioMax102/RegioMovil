import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { loadPublicReportFeed } from '../src/reportsApi';
const original = globalThis.fetch;
after(() => {
  globalThis.fetch = original;
});
test('the public feed preserves synthetic provenance and ignores arbitrary labels or fields', async () => {
  globalThis.fetch = async () =>
    Response.json({
      reports: [],
      dataset: {
        kind: 'synthetic',
        label: 'Internal private value',
        seed: 'hidden',
        referenceDate: '2026-11-08T18:00:00Z',
      },
    });
  assert.deepEqual((await loadPublicReportFeed({ stationId: 'a' })).dataset, {
    kind: 'synthetic',
    label: 'Escenario de visualización',
    referenceDate: '2026-11-08T18:00:00Z',
  });
  for (const dataset of [
    undefined,
    null,
    { kind: 'community' },
    { kind: 'synthetic', referenceDate: 'invalid' },
  ]) {
    globalThis.fetch = async () => Response.json({ reports: [], dataset });
    const result = await loadPublicReportFeed({ routeId: 'bus-a' });
    assert.deepEqual(
      result.dataset,
      dataset?.kind === 'synthetic'
        ? { kind: 'synthetic', label: 'Escenario de visualización' }
        : undefined,
    );
  }
});
