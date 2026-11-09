import test from 'node:test';
import assert from 'node:assert/strict';
import { homeWithFailedModule } from './fixtures/home-module-failure';

const fixture = await homeWithFailedModule('PublicReports');

test('a rejected community module remains local and does not replace Home or block its actions', async () => {
  const { screen, user, actions } = fixture;
  assert.ok(await screen.findByText(/No pudimos cargar la vista de reportes/));
  assert.ok(screen.getByRole('button', { name: /^Cambiar transporte:/ }));
  await user.click(screen.getByRole('button', { name: 'Compartir observación', exact: true }));
  await user.click(screen.getByRole('button', { name: 'Ver estación', exact: true }));
  assert.ok(screen.getByRole('button', { name: 'Planear desde aquí' }));
  assert.deepEqual(actions, { station: 1, generalReport: 0, contextualReport: 1, network: 0 });
  await user.click(screen.getByText('Datos y fuentes'));
  assert.equal(screen.getByText('Datos y fuentes').closest('details')!.open, true);
  assert.equal(fixture.rejectedImports(), 1);
  assert.equal(fixture.escapedErrors(), 0);
  assert.equal(screen.queryByRole('heading', { name: 'Global fallback' }), null);
});
