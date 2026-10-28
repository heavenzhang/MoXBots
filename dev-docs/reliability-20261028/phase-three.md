# MB-RELIABILITY-20261028 — phase three

## Problem and change

A successful native callback previously updated the completed map by canonical tool/input hash and removed uncertainty for that hash. Two identical concurrent invocations, a duplicate old callback or a callback whose Query had retired could therefore consume another invocation's uncertainty. The new regression baseline reproduced eight failures (one conservative case already passed). This is a proven source defect, not proof that it caused every historical 502 or stall.

The existing ContextRecoveryController now maintains per-attempt UUIDs and native Session/Query/bind-epoch/tool-ID identity in an optional version-1 journal persisted by the same SessionStore. Native admission is durable before execution. Terminal receipts consume only their exact live admission and preserve other same-hash attempts and legacy unknowns. Successful native return is distinct from business acceptance. Stop, stale scope, owner replacement, duplicated/reused IDs and missing identity cannot clear uncertainty. Background-only calls retain Query ownership even when the foreground scope has ended; missing foreground emission never grants continuation authority.

No extra worker, scheduler, storage owner, remote API or automatic cold-start executor is introduced. Historical business ledgers are unchanged. General business receipts and original unknown reconciliation remain unfinished. Existing query-only classification retains raw unknowns and its native signed review gate.

## Evidence

- Baseline: eight failures in nine identity/concurrency cases, retained privately in `phase3-baseline.log`.
- Final focused matrix: **18 files / 453 tests passed**, including 23 new attempt tests and one production SessionStore restart test. Covers matching concurrent results, old/foreign/missing success, changed input, Stop, equal-generation rebinding, interrupted peer, legacy uncertainty, storage failures, ownership changes during storage, corrupt schema and bounds, plus existing inference/failover/background/review/DOM paths.
- Actual SDK/native Shell and hooks with a synthetic loopback model: failure with partial file write, duplicate denied, corrected Write and Bash succeed, **counter=1**, three independent returned receipts survive reload. Background-recovery eligibility is a controlled fixture, not a real spawned background agent.
- Actual SDK/native Write with injected success-receipt storage failure: the file exists, the Query fails closed with 409, disk retains one pending reservation, reload retains one unknown and rejects a repeated Write; **counter=1**. SDK 0.3.296 throws the terminal API error rather than yielding a result event; the smoke checks that exact outcome. This is a disk-error injection at the persistence boundary, not an OS power-loss test.
- TypeScript, scoped ESLint, test classification and whitespace checks passed. Dependency scan: zero errors, 18 pre-existing warnings.
- Existing fixtures formerly using identity-less success callbacks were updated to use real native owner/tool IDs. The rollback fixture omits both optional extensions to model the older reader correctly. Initial integration failures and corrected retests are retained; production guards were not weakened to accept anonymous success.

Private logs are under `work/MB-RELIABILITY-20261028/`: `phase3-regression-final.log`, `phase3-targeted-retest.log`, `phase3-native-sdk.log`, `phase3-native-sdk-storage-retest.log`, `phase3-typecheck.log`, `phase3-lint.log`, `phase3-classification.log`, `phase3-deps.log`. Raw SDK/scratch data stays outside Git. This phase has no UI changes; the existing DOM review tests were rerun. Real Provider, installed client, signed application and original business completion are not established by these tests.

## Delivery

- [x] Per-attempt implementation, redacted diagnostics and local regression/native SDK checks.
- [x] Durable pending/returned outcomes and conservative restart/rollback behavior.
- [ ] Existing desktop owner source review, shared CI and main integration.
- [ ] Signed client and real native/provider path acceptance.
- [ ] General executor/business receipt reconciliation, cold-start automatic continuation and full network-fault acceptance.

Source branch: `codex/reliability-20261028`; parent dependency `347b5759aac388ee90b3a1de4bd5773196138360` (phase two), including phase-one `b453b94b797cbb492b83c11ed08b75ac981104af`. Original task base is `caab6ab648b434bee17930f90c4df4de87564bba`. Remote main was re-fetched at closeout: `775da22c196b5c72277469c3c1a357d360f030e6` contains mobile build5 changes; no overlap in this phase's recovery production sources. Final integration with latest main belongs to the existing owner.

Sole desktop/macOS-arm64/updater and combined CI/main owner: `01a12bc2-907a-7702-b6dd-788225c5dfe4`. Request the **next unfrozen batch only**. Preserve frozen 0.5.25/525.1 source `45a9e22e896b4c6238132463405b0f212bc2bb52`. This development chat did not run shared CI, formal packaging, version allocation, install, deployment or original business replay. No artifact/hash exists for this phase yet. One agent performed implementation and review; no subagent or external model call, token/cost totals not measured.
