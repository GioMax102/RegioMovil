import test from 'node:test';
import assert from 'node:assert/strict';
import { homeWithFailedModule } from './fixtures/home-module-failure';

const fixture = await homeWithFailedModule('HomeTransportHub');

test('a rejected Home hub module keeps the station, generic report and simulation sources usable', async () => {
  const { screen, user, actions } = fixture;
  assert.match(
    (await screen.findByRole('alert')).textContent!,
    /vista de recorridos no está disponible/,
  );
  await user.click(screen.getByRole('button', { name: 'Ver estación', exact: true }));
  await user.click(screen.getByRole('button', { name: 'Crear reporte', exact: true }));
  assert.equal(actions.station, 1);
  assert.equal(actions.generalReport, 1);
  assert.equal(actions.contextualReport, 0);
  await user.click(screen.getByText('Datos y fuentes'));
  const sources = screen.getByText('Datos y fuentes').closest('details')!;
  assert.equal(sources.open, true);
  assert.match(sources.textContent!, /son una simulación/);
  assert.ok(sources.querySelector('a[href="https://www.metrorrey.mx/"]'));
  assert.ok(screen.getByRole('button', { name: 'Volver a cargar inicio' }));
  assert.equal(fixture.rejectedImports(), 1);
  assert.equal(fixture.escapedErrors(), 0);
  assert.equal(screen.queryByRole('heading', { name: 'Global fallback' }), null);
});
