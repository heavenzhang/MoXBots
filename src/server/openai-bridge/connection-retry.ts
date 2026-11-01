import { setTimeout as delay } from 'node:timers/promises';
import { RetryAgent, errors, type Dispatcher } from 'undici';

/** Fetch can dispatch again after a redirect. Only its initial HTTP dispatch
 * may recover a connection; a received redirect cannot renew that permission. */
class InitialConnectionRetryAgent extends RetryAgent {
  private dispatched = false;
  constructor(private readonly pool: Dispatcher, options: ConstructorParameters<typeof RetryAgent>[1]) {
    super(pool, options);
  }
  override dispatch(options: Dispatcher.DispatchOptions, handler: Dispatcher.DispatchHandler): boolean {
    if (this.dispatched) return this.pool.dispatch(options, handler);
    this.dispatched = true;
    return super.dispatch(options, handler);
  }
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
    errorCodes: ['UND_ERR_CONNECT_TIMEOUT'],
    methods: ['POST'],
    retry(error, { state, opts }, callback) {
      const allowed = () => {
        try { return !signal.aborted && isCurrent(); }
        catch { return false; }
      };
      if (!(error instanceof errors.ConnectTimeoutError) || opts.method !== 'POST' ||
          state.counter < 1 || state.counter > 2 || !allowed()) {
        callback(error);
        return;
      }
      // Undici also refuses a disturbed request body. No HTTP error, socket
      // reset, TLS certificate failure, or partial stream gets another attempt.
      void delay(state.counter === 1 ? 250 : 750, undefined, { signal }).then(
        () => callback(allowed() ? null : error),
        () => callback(error),
      );
    },
  });
}
