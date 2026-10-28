# Recovery reliability phase one

Task: MB-RELIABILITY-20261028. Scope: prevent new uncertain-ledger pollution when background work fences recovery, and provide read-only historical inspection. This is the first increment of the approved staged reliability plan; it is not universal historical reconciliation or cold recovery.

## Behavior and cause

`recordNativeError` previously required `canRecover`, which is false when background work is present. That is an inference-recovery gate, not the owner of a known native tool outcome. A foreground Bash exit or controller denial with exact live evidence could therefore fail to record its receipt, be added as uncertain, survive restart and block later business operations.

The existing live admission/Query/Session/scope/hash checks now own outcome recording. The inference retry, failover and settled-stream continuation gates remain unchanged. Known failures still fence replay of the same command because it may have partially written. Historical unknowns are not cleared. Unknown MCP results, signals, timeouts, Stop, foreign IDs, stale scopes and storage failure remain protected.

A read-only inspection command validates the original ledger envelope and controller schema and correlates exact action hashes against physical native records. It reports missing and ambiguous records and whether success evidence is also present; none of those observations authorizes settlement. Raw inputs/results and custom tool names are absent from the output. Explicit input paths, file size limits, source-change checks, bounded record/block counts and sanitized error output protect private input handling.

## Evidence

- Baseline: the new native error regression file fails two positive scenarios on unchanged main: a known Bash exit remains uncertain and a controller denial adds a second unknown. The other 20 cases pass.
- Fixed source: 13 focused unit/integration files, 386 tests PASS. Includes background inference gates, context/ledger protection, model recovery, model failover, same-turn continuation and private SessionStore restart persistence.
- TypeScript `tsc --noEmit` and scoped ESLint PASS using bundled Node v24.
- Actual SDK/native shell and hooks with a synthetic loopback model: `scripts/verify-native-tool-error-loopback.ts --background-at-failure` PASS. Five model responses; exactly one replay denied; partial-write counter equals 1; corrected action and verification complete; uncertain count 0. Background admission state is a controlled fixture, not a real concurrent Agent. This is not installed-client or real-provider acceptance.
- Read-only command applied to two private historical snapshots. It preserves 63 and 22 unknown action hashes, finds native-record leads for 55 and 21 respectively, and leaves original source hashes unchanged. Raw snapshots/reports are outside Git. Physical records and reported successes are not business completion proof.
- No UI change, public API, permission expansion, recovery schema migration, production operation, shared CI, official build or installed-client change in this increment.

## Delivery and remaining work

Desktop/macOS-arm64/updater and combined CI/main owner: `01a12bc2-907a-7702-b6dd-788225c5dfe4`. The current 0.5.25/525.1 candidate was already frozen; this source belongs to a subsequent owner-selected batch. Only the owner starts shared CI/main integration, allocates a version and publishes the immutable artifact. Task branch push itself does not trigger the inspected main/dev/PR test workflow; no PR is opened by this development chat.

- [x] Reproduce new unknown pollution and fix the evidence/recovery authority mix-up.
- [x] Verify focused regressions, exact protected counter and durable ledger reload.
- [x] Produce a bounded read-only historical inspection path.
- [ ] Evidence-based per-operation historical resolution with a user-visible review path.
- [ ] Durable logical operation receipts and checkpoint/cold-start reconciliation, with migration/rollback gates.
- [ ] Per-stage network diagnostics and full native failure-injection matrix.
- [ ] Remote main integration, required shared CI, immutable signed artifact and installed user-path acceptance.

Before the next increment, review the deferred `codex/recovery-reconcile-20261021` source. Its old readonly-command parser and weak live source proofs must not be copied as a universal safety claim or used to clear historical writes. Preserve the original native and product owner structure, exact original-operation identity and audit evidence. A historical `is_error` string or later same-input success alone is insufficient to settle a previous unknown action.
