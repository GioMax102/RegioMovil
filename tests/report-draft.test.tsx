import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import {
  newReportDraftId,
  saveReportDraft,
  readReportDraft,
  clearReportDraft,
  REPORT_DRAFT_TTL,
  validReportDraft,
  unlockRejectedReportDraft,
  type ReportDraft,
} from '../src/reportDraft';

const draft = (): ReportDraft => ({
  version: 1,
  draftId: newReportDraftId(),
  expiresAt: Date.now() + REPORT_DRAFT_TTL,
  targetType: 'route',
  stationId: '',
  routeId: 'urban-variant-1',
  title: 'Banca dañada',
  detail: 'Observación local de prueba.',
  category: 'infrastructure',
  unitReference: '',
  locationReference: 'Parada de prueba',
  publicationConsent: false,
  photo: '',
});
afterEach(async () => {
  const saved = await readReportDraft();
  if (saved) await clearReportDraft(saved.draftId);
});

test('a definitive rejection unlocks only its exact draft without losing evidence', async () => {
  const value = { ...draft(), attempted: true, photo: 'data:image/jpeg;base64,YWJj' };
  await saveReportDraft(value);
  await unlockRejectedReportDraft(value);
  assert.deepEqual(await readReportDraft(), { ...value, attempted: false });
});

test('a rejection from an older form cannot overwrite the draft currently open elsewhere', async () => {
  const old = { ...draft(), attempted: true };
  const newer = { ...draft(), title: 'Otro reporte' };
  await saveReportDraft(old);
  await saveReportDraft(newer);
  await unlockRejectedReportDraft(old);
  await clearReportDraft(old.draftId, old);
  assert.deepEqual(await readReportDraft(), newer);
});

test('draft recovery preserves exact target, processed evidence and context without original files', async () => {
  const value = draft();
  value.photo = 'data:image/jpeg;base64,YWJj';
  value.context = { journeyId: 'journey-1', stepIndex: 2, source: 'journey', returnTo: 'guidance' };
  await saveReportDraft(value);
  assert.deepEqual(await readReportDraft(), value);
  await clearReportDraft('another-id');
  assert.ok(await readReportDraft(), 'A stale close must not remove a newer draft.');
});

test('serial writes cannot resurrect a draft after successful submission or discard', async () => {
  const value = draft();
  await Promise.all([
    saveReportDraft(value),
    saveReportDraft({ ...value, title: 'Última edición' }),
    clearReportDraft(value.draftId),
  ]);
  assert.equal(await readReportDraft(), null);
});

test('expired drafts are deleted and cannot be restored after 24 hours', async () => {
  const value = draft();
  await saveReportDraft(value);
  const realNow = Date.now;
  Date.now = () => value.expiresAt + 1;
  try {
    assert.equal(await readReportDraft(), null);
  } finally {
    Date.now = realNow;
  }
  assert.equal(await readReportDraft(), null);
});

test('invalid schema, oversized photo and unexpected source cannot become recoverable drafts', async () => {
  const value = draft();
  assert.ok(validReportDraft(value));
  for (const bad of [
    { ...value, draftId: 'guessable' },
    { ...value, title: 'x'.repeat(101) },
    { ...value, photo: 'data:image/png;base64,YWJj' },
    { ...value, photo: 'data:image/jpeg;base64,' + 'a'.repeat(540001) },
    {
      ...value,
      context: { journeyId: 'one', stepIndex: -1, source: 'journey', returnTo: 'guidance' },
    },
  ]) {
    assert.equal(validReportDraft(bad), false);
    await assert.rejects(saveReportDraft(bad as ReportDraft));
  }
});
