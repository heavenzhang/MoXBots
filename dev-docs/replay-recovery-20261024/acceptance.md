# Native tool failure recovery

Task: MB-REPLAY-RECOVERY-20261024. Development owner: `01a16e60-136b-71e1-9f52-1304b48bc1cb`.

## Problem and change

A local browser check returned a normal Bash exit error, but the controller permanently classified it as unknown. Later controller-authored denials were also added to the unknown ledger, leaving the original Session unable to write or even inspect its task ledger through Bash. The fix adds exact native error receipts to the existing ledger and uses the SDK interruption flag; it retains the original Query, guard, SessionStore and deployment ownership.

Normal, paired Bash exits allow a corrected action. Recovery still blocks an exact replay of the failed command, which may have performed partial writes. Proven controller denials do not add unknown work. Signals, timeouts, missing/foreign/stale receipts, MCP failures, concurrent identical admissions and storage errors remain protected. No historical ledger is cleared automatically.

## Local evidence

- Baseline new regression: 3 failed, 8 passed on unchanged main source. The failures reproduce correction blocked, denial pollution and missing restored proof. Later concurrency, Stop/turn persistence races and empty-output exit coverage bring the new unit file to 15 tests.
- Bridge unit/integration and builtin recovery/SessionStore: 33 files, 590 passed. This includes real private SessionStore persistence and restoration of a controller-authored denial while retaining the previous unknown action.
- TypeScript typecheck and scoped ESLint passed.
- `MOX_NATIVE_EXECUTABLE=<installed SDK executable> node --import tsx/esm scripts/verify-native-tool-error-loopback.ts`: real SDK/native Shell, hooks and bridge; synthetic local model responses, isolated HOME and workspace. Five inference calls, one normal failure with native `is_interrupt=false`, one exact replay denied, one corrected file write, one successful verification. The original failed command's partial-write counter remains exactly 1; unknown ledger count is 0. Journal writer is a fixture, distinct from the production SessionStore integration test. The same native smoke also passes with an empty error body (`Exit code 1` alone). No paid/real Provider inference or installed-client acceptance is claimed.
- Private raw logs and the hash-verified original Session backup remain outside Git under the local task directory. No business transcripts, credentials, machine backup or generated artifacts are committed.

## Release and original Session

Affected unit: desktop macOS/Sidecar (`desktop-macos-arm64-updater`). Sole shared CI/main/version/build/install/release owner remains `01a12bc2-907a-7702-b6dd-788225c5dfe4`. Development only hands off a pushed exact source SHA. Host/mobile/cloud deployment is excluded. Published 0.5.21/build521.2 remains immutable.

Required gates: exact-head review and CI, integrated remote main containment, a new immutable artifact, signed/native real-path verification and safe installation by the existing owner. The original Session is idle and its 21-file private backup passed all digest checks; its old native history and five uncertain action hashes remain unchanged. Recover that historical state only after exact-owner reconciliation; do not erase the ledger or blindly replay the website task. The current patch is not evidence of that recovery.
