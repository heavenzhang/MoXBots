import { InactivityWatchdog } from '../utils/inactivity-watchdog';

/** Same generic bound as the upstream header wait; this is an idle, not total, limit. */
export const MODEL_BODY_IDLE_TIMEOUT_MS = 5 * 60_000;

export class ModelBodyIdleTimeoutError extends Error {
  readonly code = 'upstream_body_idle_timeout';
  constructor() {
    super('Model response body made no model progress before its idle deadline');
    this.name = 'ModelBodyIdleTimeoutError';
  }
}

/**
 * Time only outstanding reads. Downstream backpressure and process suspension
 * do not consume the budget. Pings/metadata may finish a read but cannot renew
 * it; the protocol owner alone calls markProgress for actual model events.
 */
export class ModelBodyReader {
  private remainingMs: number;
  private readonly intervalMs: number;

  constructor(
    private readonly reader: ReadableStreamDefaultReader<Uint8Array>,
    private readonly signal: AbortSignal,
    private readonly isLive: () => boolean,
    private readonly timeoutMs = MODEL_BODY_IDLE_TIMEOUT_MS,
  ) {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('Invalid model body idle timeout');
    this.remainingMs = timeoutMs;
    this.intervalMs = Math.min(30_000, timeoutMs / 4);
  }

  markProgress(): void { this.remainingMs = this.timeoutMs; }

  private hasAuthority(): boolean {
    try { return this.isLive(); }
    catch { return false; } // A timer callback must fail closed, not crash the Sidecar.
  }

  async read(): Promise<ReadableStreamReadResult<Uint8Array>> {
    // Metadata can finish every read before its interval fires. Once those
    // reads consume the shared budget, do not wait for a future timer tick.
    if (this.remainingMs <= 0) {
      const error = new ModelBodyIdleTimeoutError();
      void this.reader.cancel(error).catch(() => undefined);
      throw error;
    }
    const watchdog = new InactivityWatchdog({ timeoutMs: Math.max(1, this.remainingMs), intervalMs: this.intervalMs });
    let timer: ReturnType<typeof setInterval> | undefined;
    let abort: (() => void) | undefined;
    try {
      return await new Promise<ReadableStreamReadResult<Uint8Array>>((resolve, reject) => {
        const fail = (error: Error) => {
          // Release the transport BEFORE durable recovery IO. Neither a stalled
          // body nor a stalled checkpoint write may retain its upstream socket.
          reject(error);
          void this.reader.cancel(error).catch(() => undefined);
        };
        abort = () => fail(new Error('Model request superseded or cancelled'));
        if (this.signal.aborted || !this.hasAuthority()) { abort(); return; }
        this.signal.addEventListener('abort', abort, { once: true });
        timer = setInterval(() => {
          if (!this.hasAuthority()) { abort?.(); return; }
          if (watchdog.evaluateTick().fire) fail(new ModelBodyIdleTimeoutError());
        }, this.intervalMs);
        timer.unref?.();
        this.reader.read().then(resolve, reject);
      });
    } finally {
      if (timer) clearInterval(timer);
      if (abort) this.signal.removeEventListener('abort', abort);
      // A read may resolve on wake before the first resumed timer tick.
      // Credit that gap as well, including when the arriving frame is a ping.
      watchdog.evaluateTick();
      this.remainingMs = Math.max(0, this.remainingMs - watchdog.idleMs());
    }
  }
}
