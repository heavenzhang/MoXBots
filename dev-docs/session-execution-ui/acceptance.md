# Session execution continuity UI acceptance

This record covers the renderer-only lane in the isolated `codex/execution-continuity-20261024` worktree. The primary server/shared work remains owned separately; no actual session data was read or changed.

## Behavior implemented

- The execution summary no longer displays `x/8` or a fixed total. Expanded details show only the number of execution turns, without presenting it as a completion percentage.
- A queue-matched waiting/paused model-recovery projection replaces the header's primary “running” label with “Waiting for model recovery” / “Model recovery paused”; it is not shown as a duplicate badge. Expanded details retain the attempt count and fuller explanation. Terminal or paused execution state still takes precedence.
- The orchestration hook stores recovery independently from the task ledger revision. Authoritative snapshots can update recovery at the same ledger revision; ledger-only SSE events preserve the snapshot recovery value and cannot invent or clear it. Scope mismatch and snapshot failure leave the projection unavailable/unknown.
- `SessionExecutionStatus` surfaces waiting or paused model recovery only when `recovery.turnId` matches `execution.currentQueueId` and execution is active (`running` or `rework`). Terminal and paused execution phases take precedence. Recovery labels are localized and do not expose raw status codes.
- The isolated fixture includes long objective text, waiting and paused recovery, a terminal completed state, classification failure, and unknown state.

## Verification

Node 24 DOM verification passed for the three changed suites: 16 `SessionExecutionStatus` tests, 17 `ExecutionStatusBar` tests, and 15 orchestration-hook tests (48 total). Cases cover recovery changing without a ledger revision change, SSE preservation, scope isolation, snapshot failure, queue matching, waiting/paused primary-header state without a running label, terminal precedence without a recovery label, no fixed turn denominator, and long-objective containment.

Renderer i18n resource parity passed: 5 tests. ESLint passed for changed renderer components, hook, tests, and fixture.

The isolated Playwright fixture passed at 1440×1000, 768×1024, and 390×844. It checked no horizontal overflow, long objective details without clipping, waiting/paused recovery replacing the header's running state, recovery removal for completed execution, proven acceptance coverage, classification failure, unknown state, and no browser runtime errors. Browser evidence is in `evidence/browser-result.json`; screenshots include `waiting-model-recovery-*`, `long-objective-*`, and `completed-details-*` for all three viewports.

Reproduce with Node 24: run `node dev-docs/session-execution-ui/serve.mjs`, then in another terminal run `node dev-docs/session-execution-ui/browser-check.mjs`. The fixture uses the real status component with synthetic states over loopback only.

## Acceptance boundary

The fixture validates renderer presentation and synthetic hook snapshots/events. It does not verify the primary server's ModelRecoveryState-to-queue matching, real Sidecar polling, native Tauri Chat integration, actual provider recovery, persistent session data, or production behavior. No shared CI, build/install, real session, or release validation was run in this UI lane; these local checks do not replace primary integration or release acceptance.
