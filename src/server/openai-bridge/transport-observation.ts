import { AsyncLocalStorage } from 'node:async_hooks';
import { channel } from 'node:diagnostics_channel';

export interface TransportObservation {
  requestCreated: boolean;
  requestHeadersStarted: boolean;
  requestBodySent: boolean;
  responseHeadersReceived: boolean;
  connection: 'fresh' | 'reused' | 'unobserved';
  elapsedMs: number;
}

type State = Omit<TransportObservation, 'elapsedMs'>;
const scope = new AsyncLocalStorage<State>();
const requests = new WeakMap<object, State>();
const sockets = new WeakMap<object, number>();
const object = (value: unknown): value is object => value !== null && typeof value === 'object';

// Observations only: never inspect headers/bodies/addresses or grant replay.
// Weak keys retain neither requests nor sockets. Unrelated requests have no
// trace; concurrent bridge requests are associated at request:create via ALS.
function subscribe(name: string, listener: (event: Record<string, unknown>) => void): void {
  channel(name).subscribe(message => {
    try { if (object(message)) listener(message as Record<string, unknown>); } catch { /* diagnostics cannot change transport */ }
  });
}
subscribe('undici:request:create', event => {
  const state = scope.getStore();
  if (state && object(event.request)) {
    state.requestCreated = true;
    requests.set(event.request, state);
  }
});
subscribe('undici:client:connected', event => {
  if (object(event.socket)) sockets.set(event.socket, 0);
});
subscribe('undici:client:sendHeaders', event => {
  if (!object(event.socket)) return;
  const previous = sockets.get(event.socket);
  sockets.set(event.socket, (previous ?? 0) + 1);
  const state = object(event.request) ? requests.get(event.request) : undefined;
  if (state) {
    state.requestHeadersStarted = true;
    state.connection = previous === undefined ? 'unobserved' : previous === 0 ? 'fresh' : 'reused';
  }
});
subscribe('undici:request:bodySent', event => {
  const state = object(event.request) ? requests.get(event.request) : undefined;
  if (state) state.requestBodySent = true;
});
subscribe('undici:request:headers', event => {
  const state = object(event.request) ? requests.get(event.request) : undefined;
  if (state) state.responseHeadersReceived = true;
});

/** One fetch attempt only. Missing instrumentation is unknown, never a no-dispatch receipt. */
export function createTransportObservation() {
  const started = performance.now();
  const state: State = { requestCreated: false, requestHeadersStarted: false, requestBodySent: false,
    responseHeadersReceived: false, connection: 'unobserved' };
  return {
    run: <T>(operation: () => T): T => scope.run(state, operation),
    snapshot: (): TransportObservation => ({ ...state, elapsedMs: Math.max(0, Math.round(performance.now() - started)) }),
  };
}
