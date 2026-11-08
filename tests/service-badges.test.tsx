import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { getServiceBadge } from '../src/data/serviceBadges';

const sourceHooks = registerHooks({
  load(url, context, nextLoad) {
    return url.endsWith('.css')
      ? { format: 'module', source: '', shortCircuit: true }
      : nextLoad(url, context);
  },
});
const { default: ServiceBadge } = await import('../src/components/ServiceBadge');
const { default: ServiceIdentity } = await import('../src/components/ServiceIdentity');
const { LineBadge } = await import('../src/components/Primitives');
after(() => sourceHooks.deregister());

// WCAG relative luminance, including the sRGB transfer function for each channel.
function luminance(hex: string) {
  const channels = hex
    .slice(1)
    .match(/../g)!
    .map((channel) => parseInt(channel, 16) / 255)
    .map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

test('all service and Metro identifiers keep AA text contrast with distinct solid backgrounds', () => {
  const inputs = [
    ...['L1', 'L2', 'L3', 'L4', 'L5', 'L6'].map((code) => ({ networkId: 'metrorrey', code })),
    ...[
      'metrorrey',
      'transmetro',
      'regioruta',
      'muevo-leon',
      'ecovia',
      'troncales-integradas',
      'unknown',
    ].map((networkId) => ({ networkId, code: 'Ruta' })),
  ];
  const backgrounds = new Set<string>();
  for (const input of inputs) {
    const badge = getServiceBadge(input);
    const values = [luminance(badge.background), luminance(badge.foreground)].sort((a, b) => a - b);
    const contrast = (values[1] + 0.05) / (values[0] + 0.05);
    assert.ok(contrast >= 4.5, `${input.networkId} ${input.code}: ${contrast.toFixed(2)}:1`);
    assert.ok(
      !backgrounds.has(badge.background),
      `${input.networkId} ${input.code} repeats a color`,
    );
    backgrounds.add(badge.background);
  }
});

test('route line identity overrides an abbreviated label only for rail services', () => {
  assert.deepEqual(
    getServiceBadge({ networkId: 'metrorrey', routeId: 'L3', code: 'Metro' }),
    getServiceBadge({ networkId: 'metrorrey', code: 'L3' }),
  );
  assert.notEqual(
    getServiceBadge({ networkId: 'transmetro', routeId: 'L3', code: 'L3' }).background,
    getServiceBadge({ networkId: 'metrorrey', code: 'L3' }).background,
  );
});

test('Metro and bus badges identify their service with text as well as color', () => {
  const dom = new JSDOM(
    renderToStaticMarkup(
      <div>
        <LineBadge id="L1" />
        <LineBadge id="L3" />
        <LineBadge id="LOCAL" />
        <ServiceBadge networkId="transmetro" routeId="transmetro-no-reeleccion" code="TM" />
        <ServiceBadge networkId="muevo-leon" code="105" />
      </div>,
    ),
  );
  try {
    const badges = [...dom.window.document.querySelectorAll<HTMLElement>('.service-badge')];
    assert.deepEqual(
      badges.map((badge) => badge.textContent),
      ['Línea 1', 'Línea 3', 'LOCAL', 'TM', '105'],
    );
    assert.equal(badges[3].title, 'Transmetro · TM');
    assert.equal(badges[4].title, 'Muevo León · 105');
    assert.notEqual(badges[0].style.backgroundColor, badges[1].style.backgroundColor);
    for (const badge of badges) {
      assert.ok(badge.style.backgroundColor);
      assert.ok(badge.style.color);
    }
  } finally {
    dom.window.close();
  }
});

test('payment guidance uses the shared route identifier without changing payment evidence', () => {
  const dom = new JSDOM(
    renderToStaticMarkup(<ServiceIdentity networkId="muevo-leon" code="105" compact />),
  );
  try {
    const badge = dom.window.document.querySelector<HTMLElement>('.service-identity-number')!;
    assert.ok(badge.classList.contains('service-badge'));
    assert.equal(badge.textContent, '105');
    assert.equal(badge.title, 'Muevo León · 105');
    assert.match(dom.window.document.body.textContent ?? '', /Pago por confirmar/);
    assert.doesNotMatch(dom.window.document.body.textContent ?? '', /Urbani · QR/);
  } finally {
    dom.window.close();
  }
});
