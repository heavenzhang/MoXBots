# Persistent model availability recovery

Task: MOXBOTS-MODEL-RECOVERY-001. Owners remain the builtin Query/bridge, SessionStore, and (for Goal controls) Rust SessionGoalManager.

## Scope and waiting

Ordinary builtin API Sessions and Goal turns use the same inference lease. Existing primary short retries and authorized backup selection precede durable recovery. A long Retry-After bypasses short repeated calls to that provider. Recovery retries inference only: it never resends the original task, rewinds native history, or creates a second Goal/Task queue.

SessionStore persists `modelRecovery` with a random chain ID, exact Product/native history/turn identity, optional Goal ID, non-secret route hash (including backup selection), wait count, absolute next attempt, deadline, HTTP status and waiting/paused state. The default window is 30 minutes with 15s..5min backoff; a longer upstream Retry-After is honored, or recovery pauses when it cannot fit the remaining window. Disk latency is deducted from the wait. Every post-wait dispatch rechecks deadline, cancellation, Query/route/root and checkpoint authority. SDK, bridge and Goal retries cannot each reset that window.

`SessionModelRecovery` is Query-scoped policy and scheduling, not a new persistence writer. Before a wait can authorize another inference, ContextRecoveryController archives the full inference and commits completed action evidence through the original private SessionStore ledger. Availability recovery activates action protection without reducing context. Exact tool name/canonical JSON input successes cannot repeat under a new native tool ID. Uncertain writes, corrupt/missing armed ledgers and storage errors fail closed. Semantically equivalent writes with different arguments still require business-side idempotency and read-only reconciliation; this is not distributed exactly-once delivery.

## Controls and terminal evidence

Pause/Stop synchronously revoke the local epoch and request binding before awaiting storage; the original exact SDK interrupt is sent immediately. SessionStore serializes checkpoint CAS by history, chain ID, status, turn, attempt and next-attempt timestamp. It writes a private immutable `context-recovery/<product>/stopped-<chain>.json` control fence with file and directory sync before publishing paused metadata. If the sessions index rewrite fails, the fence still prevents automatic cold recovery. If even the fence cannot be persisted, Stop interrupts the Query and reports `MODEL_RECOVERY_STOP_NOT_DURABLE` instead of claiming durable success.

The API watchdog suspends inactivity accounting only during explicit recovery backoff, retaining ordinary inference/tool timeouts. Goal remains busy in the original turn, so its existing deadline, pause/cancel control revision and exact current-turn stop continue to apply. A safety stop is returned as `automatic_replay_blocked`, causing the existing Goal recovery pause rather than another generic ten-failure dispatch chain.

Only the active recovery bridge's native child receives a 35-minute `API_TIMEOUT_MS` (the recovery window plus bounded short-call overhead). Native byte/event/retry watchdogs and Bun transport idle timeout are disabled for that loopback lease; the bridge retains its 30s upstream header limit, the Session retains its ordinary 10-minute inactivity watchdog outside explicit backoff, and recovery retains its absolute 30-minute deadline. Utility/one-shot and managed routes keep their existing timers. SDK 0.3.296 source was inspected for `API_FORCE_IDLE_TIMEOUT=0` and retry-watchdog behavior; documented timer boundaries are in the [official environment-variable reference](https://code.claude.com/docs/en/env-vars) and [streaming watchdog reference](https://code.claude.com/docs/en/network-config#streaming-idle-watchdogs).

HTTP 200 is not success evidence. An SSE terminal must be delivered into the consumer queue before checkpoint clearing; a pre-terminal error/truncation seals the lease and pauses any recovery. A terminal-receipt cleanup tolerates the SDK closing HTTP, but retains the Query epoch/owner/checkpoint checks so user Stop wins. Following inference waits for in-flight terminal cleanup before reading the journal.

## Cold restoration

Opening/restoring the original Session loads its native identity, exact route and original action ledger. Only a verified waiting intent can automatically enqueue a bounded continuation reminder, never the original user input or a prior tool call. The new Query rebinds that same chain and honors the original next-attempt time and deadline before any provider call; it starts with the user's selected primary route and does not reacquire a short-retry budget. A stop fence, expired window, missing native history, pending rewind/mutation, mismatched route or uncertain ledger requires explicit resolution. A new explicit user instruction can retire a paused intent through the original cancelable admission/CAS, creating a new recovery epoch.

Goal intents are excluded from ordinary cold enqueue: only the original Rust Goal owner can resume them, preserving its revision and single current-turn claim. Rust startup, Goal resume and deadline semantics are unchanged. Closing a Tab retains existing BackgroundCompletion/Goal owners. Application exit/sleep is not a promise of uninterrupted execution: ordinary persisted waits resume when the original Session is restored; Goal startup uses its existing durable owner.

External/subscription/managed/integrated runtimes keep their native inference and credential ownership. This bridge does not intercept those processes or replay their tools; this release establishes the recovery contract for builtin API execution in both product modes. Real Provider, signed native installation and production business acceptance remain separate release gates.

## Verification

Focused bridge/Session owner tests cover storage and control races, Retry-After, canceled/expired re-admission, partial SSE, and success cleanup. SessionStore integration uses actual private archives/ledger/index and forces index publication failure after Stop. Builtin execution integration checks stop during explicit resume CAS and refuses missing native history. UI uses the production MessageList/GoalStatusBar with synthetic state transitions.

`node --import tsx/esm scripts/verify-model-recovery-loopback.ts` runs SDK 0.3.296/native child with isolated HOME, synthetic loopback providers and an actual MCP counter. It verifies completed counter=1 through 503 recovery and a same-native Query reconstruction while two new-ID duplicate calls are denied. The controlled fixture clock compresses recorded 15s waits; the script's fixture writer is not claimed as production SessionStore/native UI acceptance. Evidence and final CI/main/publisher receipts: `dev-docs/model-recovery/acceptance.md`.
