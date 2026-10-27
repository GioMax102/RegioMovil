import test, { after, afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import React, { useRef } from 'react';
import useMapWorkspaceHeight from '../src/useMapWorkspaceHeight';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true });
const names = [
  'window',
  'document',
  'navigator',
  'HTMLElement',
  'Node',
  'MutationObserver',
  'IS_REACT_ACT_ENVIRONMENT',
] as const;
const previous = new Map(
  names.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]),
);
for (const name of names)
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value: name === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[name],
  });
const { render, cleanup, act, waitFor } = await import('@testing-library/react');
const viewport = Object.assign(new dom.window.EventTarget(), { height: 1025, offsetTop: 0 });
Object.defineProperty(dom.window, 'visualViewport', { configurable: true, value: viewport });
Object.defineProperty(dom.window, 'innerHeight', { configurable: true, value: 1025 });
let workspaceTop = 120;
let navigationVisible = true;
dom.window.HTMLElement.prototype.getBoundingClientRect = function () {
  const nav = this.classList.contains('mobile-nav');
  const top = nav ? (navigationVisible ? 955 : 0) : workspaceTop;
  const height = nav ? (navigationVisible ? 70 : 0) : 0;
  return {
    top,
    bottom: top + height,
    height,
    x: 0,
    y: top,
    left: 0,
    right: 390,
    width: 390,
    toJSON() {},
  };
};

function Workspace() {
  const element = useRef<HTMLDivElement>(null);
  useMapWorkspaceHeight(element);
  return (
    <>
      <div ref={element} data-testid="workspace">
        <input aria-label="Lugar" />
      </div>
      <nav className="mobile-nav" />
    </>
  );
}
beforeEach(() => {
  viewport.height = 1025;
  viewport.offsetTop = 0;
  workspaceTop = 120;
  navigationVisible = true;
});
afterEach(async () => {
  await act(async () => cleanup());
});
after(() => {
  dom.window.close();
  for (const [name, descriptor] of previous) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else Reflect.deleteProperty(globalThis, name);
  }
});

test('the map fits below its real tabs and above the visible mobile navigation', () => {
  const view = render(<Workspace />);
  const workspace = view.getByTestId('workspace');
  assert.equal(workspace.style.getPropertyValue('--map-workspace-height'), '835px');
  assert.equal(workspace.dataset.keyboard, 'false');
});

test('a resized keyboard viewport ignores navigation hidden below it and cleans up its listeners', async () => {
  const view = render(<Workspace />);
  const workspace = view.getByTestId('workspace');
  await act(async () => {
    view.getByRole('textbox', { name: 'Lugar' }).focus();
    viewport.height = 600;
    viewport.dispatchEvent(new dom.window.Event('resize'));
  });
  await waitFor(() => {
    assert.equal(workspace.style.getPropertyValue('--map-workspace-height'), '480px');
    assert.equal(workspace.dataset.keyboard, 'true');
  });
  await act(async () => {
    view.unmount();
  });
  assert.equal(workspace.style.getPropertyValue('--map-workspace-height'), '');
  assert.equal(workspace.dataset.keyboard, undefined);
  viewport.height = 450;
  viewport.dispatchEvent(new dom.window.Event('resize'));
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(
    workspace.style.getPropertyValue('--map-workspace-height'),
    '',
    'Unmounted maps must not retain viewport subscriptions.',
  );
});

test('desktop and panned visual viewports use their available space without reserving a hidden nav', async () => {
  navigationVisible = false;
  const view = render(<Workspace />);
  const workspace = view.getByTestId('workspace');
  assert.equal(workspace.style.getPropertyValue('--map-workspace-height'), '905px');
  await act(async () => {
    viewport.offsetTop = 160;
    viewport.height = 500;
    viewport.dispatchEvent(new dom.window.Event('scroll'));
  });
  await waitFor(() =>
    assert.equal(workspace.style.getPropertyValue('--map-workspace-height'), '500px'),
  );
});
