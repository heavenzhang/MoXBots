# UI workstream

## Changes

- Normalize only the explicit native `is_error: boolean` tool-result field to renderer `isError` for live V2 events and restored transcript rows. The result string is never scanned for error phrases.
- The builtin chat performs a read-only recovery-actions inspection once for each idle transcript revision (`message count + settled assistant id`). Any returned actions open the review card automatically. Empty inspections stay visually collapsed; the persistent “核对操作结果” entry remains available for manual refresh. Automatic inspection failures are quiet, and the review does not poll continuously.
- “恢复此会话” is one explicit action. It serially reconciles only server-marked eligible evidence using each response's newest digest. If a response is ambiguous, it refreshes the authoritative snapshot and never resends that action hash. Remaining ineligible evidence stays visible as a blocker; only an empty final snapshot shows that the user can continue input in this same session. The action never resends the old command or automatically continues the task.
- `native_hook_denied` is labeled “原生工具已拒绝”. Other eligible and ineligible actions show their evidence reason and safe next step.

## Independent browser review

Start the repository Vite dev server on loopback and open:

```text
http://127.0.0.1:5173/dev/recovery-review-preview.html
```

For the all-eligible path directly, open `http://127.0.0.1:5173/dev/recovery-review-preview.html?scenario=eligible`.

The page renders the production `RecoveryActionReview` and `BashTool` components against synthetic local data. Switch between “Blocked evidence” and “All eligible” to review denied Bash + task query rows, remaining blockers, successful session recovery, and the failed/successful Bash status icons. The preview reconcile handler only removes rows from local React state and advances a synthetic digest; it does not call the backend. This is a component browser review fixture, not a live-session or backend acceptance.

## Verification

- `sessionRestoreGuards.test.ts` and `transcriptDisplay.test.ts`: 39 unit tests passed.
- `RecoveryActionReview.test.tsx`: 10 DOM tests cover per-revision auto-inspection, reinspection after a new revision, queued revisions, quiet automatic failures, batch recovery, current-digest sequencing, in-flight close, and explicit native-denial evidence.
- `transcriptDisplay` tests prove only explicit camelCase/snake_case booleans affect failure state; result text alone remains neutral.
- Full `tsc --noEmit` passed after backend contract integration. Scoped ESLint passed; it printed only the repository's stale `baseline-browser-mapping` advisory.

## Independent IAB acceptance

The parent agent reviewed the actual production components through the loopback Vite fixture, using synthetic API snapshots only:

- At 1280px, the all-eligible case settled Bash-denied + TaskGet in one explicit recovery action, ended with zero actions, and showed the same-session next-message guidance.
- At 390×844, there was no horizontal overflow or clipped content. The blocked case retained two genuine unverified records after settling two eligible records.
- The Bash failure rendered a red failed state without a success check; the successful command rendered its green completed state.
- The fixture also mounts the production `BlockGroup → ProcessRow → ProcessStatus` collapsed-row path. IAB confirmed the failed row shows a red X and no check, the successful row shows a check, and expanding the failed row does not add a success check.
- `BlockGroup.test.tsx`: 20 DOM tests passed, including explicit selectors asserting failure has no `.app-icon-check` and success does.

This verifies renderer behavior with synthetic responses. It is not acceptance of the installed desktop binary, original session state, or backend persistence against real data.

## Limits

The UI can only offer `eligible=true` actions supplied by the server. The backend owns native denial proof, snapshot eligibility, persistence, and reconciliation. A browser fixture does not verify an installed desktop client or actual account/session data.
