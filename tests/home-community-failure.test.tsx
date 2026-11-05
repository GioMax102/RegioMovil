import test from 'node:test';
import assert from 'node:assert/strict';
import { homeWithFailedModule } from './fixtures/home-module-failure';

const fixture = await homeWithFailedModule('HomeCommunityFeed');

test('a rejected community module remains local and does not replace Home or block its actions', async () => {
  const { screen, user, actions } = fixture;
  assert.match(
    (await screen.findByRole('alert')).textContent!,
    /No pudimos abrir las observaciones/,
  );
  assert.ok(screen.getByRole('tab', { name: /^Metro/ }));
  assert.ok(screen.getByRole('tab', { name: /^Autobús/ }));
  await user.click(screen.getByRole('button', { name: 'Crear reporte', exact: true }));
  await user.click(screen.getByRole('button', { name: /Reportar aquí/ }));
  await user.click(screen.getByRole('button', { name: 'Ver estación', exact: true }));
  await user.click(screen.getByRole('button', { name: /Explorar la red:/ }));
  assert.deepEqual(actions, { station: 1, generalReport: 1, contextualReport: 1, network: 1 });
  await user.click(screen.getByText('Datos y fuentes'));
  assert.equal(screen.getByText('Datos y fuentes').closest('details')!.open, true);
  assert.equal(fixture.rejectedImports(), 1);
  assert.equal(fixture.escapedErrors(), 0);
  assert.equal(screen.queryByRole('heading', { name: 'Global fallback' }), null);
});
