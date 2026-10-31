# Visible input rejected before native dispatch

Task MB-HISTORY-RETEST-20261101-AUDIT; reviewed base8364b29606c287e7e0488bfd1fc2c76286dd8881.

## Reproduction and change

The quality-reference original Session accepted a visible input on528.1, rejected it before SDK dispatch (deadline_exceeded), and later logged startup timeout. Its V2 turn is still running under the current reader, so the earlier audit's suggestion of old-reader incompatibility was unsupported. This patch covers the independently reproduced missing Product terminal, not every startup failure.

The new existing-queue integration fixture fails on8364: zero SDK inputs and one stopped observer receipt, but Product turn persists as running. The fix captures a receipt through the original transcript owner after a user root is surfaced. Queue rejection settles only that exact still-current live turn, flushes it before publishing rejection, and never ends a predecessor or later owner. Writer replacement or live-turn replacement invalidates the receipt. Disk baseline publication is not itself a lifecycle switch; no persisted generation is used as a surrogate live owner.

No original Session, unknown-operation journal or business action is rewritten or repeated. No new release or CI owner. This patch does not claim to repair all intent classification failures, the independent startup watchdog, or previously orphaned historical turns.

## Validation

RED retained privately as visible-rejection-red.log: expected stopped, received running, on the real Product writer and queue with synthetic SDK.
Three integration cases read disk after rejection: own root is stopped; previous root stays running; later root stays running. Baseline full285 execution/native cases passed before the patch. Final300 targeted cases passed (builtin210 + execution78 + runtime boundary12); all TypeScript, scoped ESLint, test classification and diff checks passed; these are not real-provider/original-business acceptance.

## Delivery

Affected unit: desktop/macOS-arm64/updater and sharedCI/main, unique owner01a12bc2-907a-7702-b6dd-788225c5dfe4. Existing0.5.29/529.1 frozen8364 candidate remains unchanged; owner selects this independent increment for a subsequent candidate with fresh exact-source CI. No change to published artifact/tag. Current install still528.1. Original task acceptance remains0/3 until actual code delivery and user-path readback.
