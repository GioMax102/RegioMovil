import test from 'node:test';
import assert from 'node:assert/strict';
import { withRequestTimeout } from '../src/request.ts';

test('el plazo cancela también la espera del cuerpo en WebViews sin AbortSignal.timeout', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(AbortSignal, 'timeout');
  Object.defineProperty(AbortSignal, 'timeout', { configurable: true, value: undefined });
  let signal;
  try {
    await assert.rejects(
      withRequestTimeout(async (requestSignal) => {
        signal = requestSignal;
        // Headers arrived, but the response body never completes.
        await new Promise((_, reject) =>
          requestSignal.addEventListener(
            'abort',
            () => reject(new DOMException('Cancelled', 'AbortError')),
            { once: true },
          ),
        );
      }, 15),
      { name: 'AbortError' },
    );
    assert.equal(signal.aborted, true);
  } finally {
    if (descriptor) Object.defineProperty(AbortSignal, 'timeout', descriptor);
  }
});

test('una solicitud completada libera su temporizador y la suscripción de cancelación', async () => {
  const parent = new AbortController();
  let signal;
  assert.deepEqual(
    await withRequestTimeout(
      async (requestSignal) => {
        signal = requestSignal;
        return { ok: true };
      },
      15,
      parent.signal,
    ),
    { ok: true },
  );
  parent.abort();
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(signal.aborted, false);
});

test('cancelar la pantalla interrumpe la operación y respeta una cancelación previa', async () => {
  const parent = new AbortController();
  const pending = withRequestTimeout(
    (signal) =>
      new Promise((_, reject) => {
        signal.addEventListener(
          'abort',
          () => reject(new DOMException('Cancelled', 'AbortError')),
          { once: true },
        );
      }),
    1000,
    parent.signal,
  );
  parent.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  await withRequestTimeout(
    async (signal) => assert.equal(signal.aborted, true),
    1000,
    parent.signal,
  );
});
