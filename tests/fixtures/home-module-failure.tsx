import { after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import React from 'react';
import { JSDOM } from 'jsdom';

/** Each caller runs in its own test process: rejected imports stay cached in ESM. */
export async function homeWithFailedModule(
  module: 'HomeTransportHub' | 'HomeCommunityFeed' | 'PublicReports',
) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'http://localhost/',
  });
  const previous = new Map<string, PropertyDescriptor | undefined>();
  for (const [name, value] of Object.entries({
    window: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement,
    Element: dom.window.Element,
    Node: dom.window.Node,
    MutationObserver: dom.window.MutationObserver,
    Event: dom.window.Event,
    localStorage: dom.window.localStorage,
    getComputedStyle: dom.window.getComputedStyle,
    IS_REACT_ACT_ENVIRONMENT: true,
    fetch: async () => assert.fail('A failed optional Home module must not start data requests.'),
  })) {
    previous.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  }
  let rejectedImports = 0;
  const hooks = registerHooks({
    load(url, context, next) {
      if (url.endsWith(`/${module}.tsx`)) {
        rejectedImports++;
        return {
          format: 'module',
          source: `throw new Error('Simulated optional module download failure'); export default null;`,
          shortCircuit: true,
        };
      }
      return url.endsWith('.css')
        ? { format: 'module', source: '', shortCircuit: true }
        : next(url, context);
    },
  });
  const { default: HomeDashboard } = await import('../../src/components/HomeDashboard');
  const { network } = await import('../../src/api');
  const { render, screen, cleanup } = await import('@testing-library/react');
  const { default: userEvent } = await import('@testing-library/user-event');
  afterEach(cleanup);
  after(() => {
    hooks.deregister();
    dom.window.close();
    for (const [name, descriptor] of previous)
      descriptor
        ? Object.defineProperty(globalThis, name, descriptor)
        : Reflect.deleteProperty(globalThis, name);
  });
  const actions = { station: 0, generalReport: 0, contextualReport: 0, network: 0 };
  let escapedErrors = 0;
  class UnexpectedGlobalFallback extends React.Component<
    { children: React.ReactNode },
    { failed: boolean }
  > {
    state = { failed: false };
    static getDerivedStateFromError() {
      return { failed: true };
    }
    componentDidCatch() {
      escapedErrors++;
    }
    render() {
      return this.state.failed ? <h1>Global fallback</h1> : this.props.children;
    }
  }
  const station = network.stations[0];
  render(
    <UnexpectedGlobalFallback>
      <HomeDashboard
        station={station}
        board={null}
        loading={false}
        favorite={false}
        onFavorite={() => {}}
        onArrival={() => {}}
        onStationDetails={() => actions.station++}
        onReport={() => actions.generalReport++}
        onNetwork={() => actions.network++}
        onReportTarget={() => actions.contextualReport++}
        now={new Date('2026-11-05T18:00:00Z')}
      />
    </UnexpectedGlobalFallback>,
  );
  return {
    screen,
    actions,
    user: userEvent.setup({ document: dom.window.document }),
    rejectedImports: () => rejectedImports,
    escapedErrors: () => escapedErrors,
  };
}
