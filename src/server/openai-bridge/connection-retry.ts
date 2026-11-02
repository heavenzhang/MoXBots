import { setTimeout as delay } from 'node:timers/promises';
import { Agent, RetryAgent, buildConnector, errors, type Dispatcher } from 'undici';

const transientConnectionCodes = new Set([
  'UND_ERR_CONNECT_TIMEOUT', 'ECONNRESET', 'ECONNREFUSED',
  'EHOSTUNREACH', 'ENETUNREACH', 'EAI_AGAIN',
]);
const connectionFailures = new WeakSet<Error>();

/** Only the native connector knows that no socket reached the HTTP writer.
 * Preserve that fact by object identity; a status, message or error code alone
 * cannot distinguish a TLS handshake reset from a reset after sending a POST. */
export function withConnectionEstablishmentProof(connect: buildConnector.connector): buildConnector.connector {
  return (options, callback) => {
    let settled = false;
    connect(options, (...args) => {
      if (!settled) {
        settled = true;
        const error = args[0];
        if (error && transientConnectionCodes.has((error as NodeJS.ErrnoException).code ?? '')) {
          connectionFailures.add(error);
        }
      }
      callback(...args);
    });
  };
}

export function isConnectionEstablishmentFailure(error: unknown): boolean {
  // fetch wraps the connector's original error in a TypeError cause.
  for (let depth = 0; depth < 4 && error instanceof Error; depth++) {
    if (connectionFailures.has(error) || error instanceof errors.ConnectTimeoutError) return true;
    error = error.cause;
  }
  return false;
}

export function createDirectConnectionPool(): Dispatcher {
  return new Agent({ connect: withConnectionEstablishmentProof(buildConnector({ allowH2: true })) });
}

/** Fetch can dispatch again after a redirect. Only its initial HTTP dispatch
 * may recover a connection; a received redirect cannot renew that permission. */
class InitialConnectionRetryAgent extends RetryAgent {
  private dispatches = 0;
  constructor(private readonly pool: Dispatcher, options: ConstructorParameters<typeof RetryAgent>[1]) {
    super(pool, options);
  }
  override dispatch(options: Dispatcher.DispatchOptions, handler: Dispatcher.DispatchHandler): boolean {
    if (++this.dispatches > 1) return this.pool.dispatch(options, handler);
    return super.dispatch(options, handler);
  }
  hasInitialConnectionFailure(error: unknown): boolean {
    return this.dispatches === 1 && isConnectionEstablishmentFailure(error);
  }
}

/** A redirect already delivered the first HTTP request. Its later connection
 * failure cannot authorize resending that first request to a model candidate. */
export function hasInitialConnectionFailure(dispatcher: Dispatcher | undefined, error: unknown): boolean {
  return dispatcher instanceof InitialConnectionRetryAgent && dispatcher.hasInitialConnectionFailure(error);
}

/**
 * Request-owned connection establishment only. The native connector raises this
 * error before returning a connected socket to the HTTP request writer. Do not
 * infer this authority from a 502 body, diagnostics, or zero delivered bytes.
 * Keep the shared pool, but never share a retry timer/AbortSignal across requests.
 */
export function withConnectionRetries(
  dispatcher: Dispatcher,
  signal: AbortSignal,
  isCurrent: () => boolean,
): Dispatcher {
  return new InitialConnectionRetryAgent(dispatcher, {
    statusCodes: [],
    errorCodes: [...transientConnectionCodes],
    methods: ['POST'],
    retry(error, { state, opts }, callback) {
      const allowed = () => {
        try { return !signal.aborted && isCurrent(); }
        catch { return false; }
      };
      if (!isConnectionEstablishmentFailure(error) || opts.method !== 'POST' ||
          state.counter < 1 || state.counter > 2 || !allowed()) {
        callback(error);
        return;
      }
      // Undici also refuses a disturbed request body. No HTTP error, socket
      // reset after socket handoff, certificate failure, or partial stream gets a retry.
      void delay(state.counter === 1 ? 250 : 750, undefined, { signal }).then(
        () => callback(allowed() ? null : error),
        () => callback(error),
      );
    },
  });
}
