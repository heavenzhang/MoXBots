# Phase19: recover proven connection establishment failures

The installed 0.5.37/537.1 Max continuation completed native tools, then failed on a fresh inference when its TLS socket closed before the secure connection was established. The connection layer admitted only ConnectTimeoutError, so ECONNRESET went straight to a local 502. An older uncertain tool outcome correctly blocked generic replay, but also left this proven unsent request without candidate recovery.

The fix records transient native connector errors before socket handoff, retains their object identity through fetch's error cause, and applies the same request-owned initial-plus-two connection budget to direct and proxy paths. Exhaustion can enter the existing validated candidate chain under the current connection capability. It does not add four more HTTP attempts, change candidate eligibility, weaken TLS validation, or grant durable/stream recovery. A later redirect dispatch cannot provide this proof for the original inference.

## Verification

- Before the fix, an actual CONNECT followed by target TLS reset made one connection instead of the expected three. The new fixture initially failed with `expected 3, received 1`.
- Direct and CONNECT/TLS fixtures verify all three supported protocols: three failed handshakes, zero target HTTP requests, one backup response, and a later distinct request continuing on the elected route. Old unknown-operation records remain equal; repeated SDK inference is sealed.
- A review regression first exposed a redirect-after-send mistake (`expected 1, received 2`). Request-owned dispatch counting now excludes it. Direct and proxy variants pass.
- Sent POST and partial-stream resets, certificate/permanent configuration errors, forged error text/codes, stale callbacks, cancellation and revoked owner/route/candidate permission remain excluded.
- Scoped integration: 118 passed. Scoped unit: 94 passed. Typecheck, scoped lint, classification and whitespace checks passed. Default tests are synthetic and credential-free.

## Delivery boundary

Task: `.agent-sync/tasks/codex-recovery-phase19-20261102-0f57539f.md`.
Desktop CI/main/version/package/install/native validation remains with chat `01a12bc2-907a-7702-b6dd-788225c5dfe4`. The installed 537.1 artifact does not contain Phase19. Source validation must be followed by exact-artifact installation and original-session results before calling this incident resolved. No historical business action is reissued by these tests or by the fix.
