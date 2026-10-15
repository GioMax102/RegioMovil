/** Worker scheduling tests; no DOM, network, or graph/performance simulation. */
import test, { afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createMobilityPlanner } from '../src/mobility/api';
import type { MobilityNetwork, MobilityPlan, MobilityRequest } from '../src/mobility/types';

type Message =
  | { type: 'initialize'; network: MobilityNetwork }
  | { type: 'plan'; id: number; request: MobilityRequest };
const originalWorker = Object.getOwnPropertyDescriptor(globalThis, 'Worker');
const workers: ControlledWorker[] = [];
const planners: ReturnType<typeof createMobilityPlanner>[] = [];
class ControlledWorker {
  messages: Message[] = [];
  terminated = false;
  onmessage:
    ((event: { data: { id: number; plan?: MobilityPlan; error?: string } }) => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(
    readonly url: URL,
    readonly options: WorkerOptions,
  ) {
    workers.push(this);
  }
  postMessage(message: Message) {
    this.messages.push(message);
  }
  terminate() {
    this.terminated = true;
  }
  respond(id: number, plan: MobilityPlan) {
    this.onmessage?.({ data: { id, plan } });
  }
  planMessages() {
    return this.messages.filter(
      (message): message is Extract<Message, { type: 'plan' }> => message.type === 'plan',
    );
  }
}
const network: MobilityNetwork = {
  version: 1,
  mode: 'experimental',
  stops: [],
  routes: [],
  coverage: {},
  assumptions: [],
};
const request = (preference: MobilityRequest['preference']): MobilityRequest => ({
  from: { id: 'metro:padre-mier' },
  to: { id: 'metro:universidad' },
  preference,
  scenario: 'normal',
  offline: true,
});
const result = (preference: MobilityRequest['preference']): MobilityPlan => ({
  ...request(preference),
  mode: 'experimental',
  journeys: [],
  generatedAt: '2026-10-15T18:00:00.000Z',
  diagnostics: { expansions: 0, truncated: false },
});
const observe = <T,>(promise: Promise<T>) =>
  promise.then(
    (value) => ({ status: 'fulfilled' as const, value }),
    (error) => ({ status: 'rejected' as const, error: error as Error }),
  );
function createPlanner() {
  const planner = createMobilityPlanner(network);
  planners.push(planner);
  return planner;
}
beforeEach(() => {
  workers.length = 0;
  planners.length = 0;
  Object.defineProperty(globalThis, 'Worker', {
    configurable: true,
    writable: true,
    value: ControlledWorker,
  });
});
afterEach(() => {
  try {
    for (const planner of planners) planner.dispose();
    assert.ok(
      workers.every((worker) => worker.terminated),
      'Every worker is terminated after its test.',
    );
  } finally {
    if (originalWorker) Object.defineProperty(globalThis, 'Worker', originalWorker);
    else Reflect.deleteProperty(globalThis, 'Worker');
  }
});

test('a planner initializes its single module worker once and reuses that graph for subsequent searches', async () => {
  const planner = createPlanner();
  assert.equal(workers.length, 1);
  const worker = workers[0];
  assert.match(worker.url.href, /\/mobility\/worker\.ts$/);
  assert.equal(worker.options.type, 'module');
  assert.deepEqual(worker.messages, [{ type: 'initialize', network }]);
  const first = observe(planner.plan(request('fastest')));
  worker.respond(worker.planMessages()[0].id, result('fastest'));
  assert.equal((await first).status, 'fulfilled');
  const second = observe(planner.plan(request('accessible')));
  worker.respond(worker.planMessages()[1].id, result('accessible'));
  assert.equal((await second).status, 'fulfilled');
  assert.equal(workers.length, 1);
  assert.equal(worker.messages.filter((message) => message.type === 'initialize').length, 1);
});

test('three rapid priorities compute only the active search and the latest queued search, rejecting the superseded middle choice', async () => {
  const planner = createPlanner();
  const worker = workers[0];
  // Observe every promise immediately: replacing or disposing work must never leave
  // an unhandled rejection in the component or in this scheduling regression.
  const first = observe(planner.plan(request('fastest')));
  const middle = observe(planner.plan(request('comfortable')));
  const latest = observe(planner.plan(request('accessible')));
  assert.deepEqual(
    worker.planMessages().map((message) => message.request.preference),
    ['fastest'],
  );
  const replaced = await middle;
  assert.equal(replaced.status, 'rejected');
  if (replaced.status === 'rejected') assert.match(replaced.error.message, /prioridad nueva/);
  const active = worker.planMessages()[0];
  worker.respond(active.id, result('fastest'));
  const firstOutcome = await first;
  assert.equal(firstOutcome.status, 'fulfilled');
  assert.deepEqual(
    worker.planMessages().map((message) => message.request.preference),
    ['fastest', 'accessible'],
  );
  assert.ok(!worker.planMessages().some((message) => message.request.preference === 'comfortable'));
  const queued = worker.planMessages()[1];
  assert.notEqual(queued.id, active.id);
  worker.respond(queued.id, result('accessible'));
  const lastOutcome = await latest;
  assert.equal(lastOutcome.status, 'fulfilled');
  if (lastOutcome.status === 'fulfilled') assert.equal(lastOutcome.value.preference, 'accessible');
});

test('a worker failure before the first search makes future searches reject on the next microtask rather than waiting for the 12-second timeout', async () => {
  const planner = createPlanner();
  const worker = workers[0];
  worker.onerror?.();
  assert.equal(worker.terminated, true);
  let settled = false;
  const observed = observe(planner.plan(request('fastest'))).then((outcome) => {
    settled = true;
    return outcome;
  });
  // The promise and its observation each require a microtask; no timers advance.
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(
    settled,
    true,
    'The initialization failure must remain fatal instead of falling back or creating a pending timeout.',
  );
  const outcome = await observed;
  assert.equal(outcome.status, 'rejected');
  if (outcome.status === 'rejected')
    assert.match(outcome.error.message, /El cálculo se interrumpió/);
  const later = await observe(planner.plan(request('accessible')));
  assert.equal(later.status, 'rejected');
  assert.equal(workers.length, 1);
  assert.equal(
    worker.planMessages().length,
    0,
    'A failed worker must never receive or queue another calculation.',
  );
});
