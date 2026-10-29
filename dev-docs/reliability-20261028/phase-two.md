# MB-RELIABILITY-20261028 — phase two

## Scope and behavior

This increment adds explicit review of historical native task queries and a durable query-only audit record. It depends on phase-one commit `b453b94b797cbb492b83c11ed08b75ac981104af` on `codex/reliability-20261028`; the original base remains `caab6ab648b434bee17930f90c4df4de87564bba`.

The built-in chat has an operation-review entry, including for tool-hook errors which did not produce an agent-error banner. The user can refresh, inspect redacted action fingerprints and explicitly save a query-only classification for an exact native TaskGet/TaskList action. The UI does not claim the query or business task succeeded. Other actions remain protected with missing-evidence / external-receipt explanations. Running sessions disable the entry; stale async results, repeated clicks and session changes do not reuse old actions. Narrow-screen lists scroll without hiding the title, boundary explanation or saved count.

Only the existing native Session-tab signature can authorize the exact POST. Source reads and mutations pass through SessionEngine. Existing Session lifecycle serialization, Stop/Query/workspace/bridge ownership, updater admission and SessionStore lock/CAS are reused. No second recovery queue, worker, key, permissions service or storage owner is introduced.

The version-1 ledger gains optional `readonlyTasks` receipts. Original unknown hashes remain on disk; effective uncertainty excludes only strictly validated native query hashes. Live adoption retains all other controller state. An older binary keeps uncertainty on rollback, and may discard receipts when saving; it never gets permission to repeat an old write. The old unmerged branch's shell/SQL classifier and generic historical clearance were not adopted.

## Validation

- 17 focused files / **429 tests PASS**, covering context recovery, native outcomes, background inference, failover, model recovery, stream continuation, durable Store reload, signed routes, query-only review and React interactions.
- Actual **Rust source** native-signature tests: **7 PASS** in a private dependency-only harness. This is not a full Tauri application build or WebView acceptance.
- Actual installed SDK/native `TaskGet {}` validation and `TaskList {}` invocation, plus **SDK persisted-history reader**: `scripts/verify-native-recovery-review.ts` PASS. Three synthetic model responses; two query receipts; two raw unknown hashes retained; effective unknown count zero after reload. The starting unknown ledger and model are synthetic; no business operation was replayed. Production SessionStore is independently exercised by integration tests.
- TypeScript and scoped ESLint PASS; test-classification PASS. Dependency check has zero errors (pre-existing type-only orphan warnings documented in local evidence).
- Browser acceptance with the real React component, production CSS/theme and simulated API: explicit inspection; only query-only item has a save action; after save other items remain; saved count 1; busy transition clears/disables; 390 px viewport has scrollWidth 390. Original daily client was not touched.
- Rechecked the prior private historical snapshots read-only: 1 of 63 unknowns qualifies for query-only review in the salary snapshot; 0 of 22 qualifies in the AI configuration snapshot. No live or snapshot ledger was changed. This deliberately cannot unblock the remaining 62/22 operations without original execution/business evidence.

Private evidence lives outside Git under `work/MB-RELIABILITY-20261028/`: phase2-regression/typecheck/lint/deps/classification logs, phase2-native-proof.log, phase2-native-sdk.log, phase2-history-snapshot-review.json and phase2-ui/review-saved.jpg. The initial persistence test fixture failed because its Session index had not been durably materialized before module reset; the fixture now uses the production transcript append path and passes. No production guard was weakened for that test.

## Delivery and acceptance boundaries

- [x] Source implementation, focused tests and native query evidence verified.
- [x] Rollback preserves raw unknowns; bad proofs/digests and stale writes fail closed.
- [x] Isolated actual browser component interaction and narrow-screen inspection.
- [ ] Existing desktop owner source review, shared CI and remote main integration.
- [ ] Same-source signed client, real native UI-to-sidecar route, actual provider and installed-client user-path verification.
- [ ] General business receipts, persistent logical steps and cross-restart recovery.

The sole desktop/macOS-arm64/updater and shared CI/main owner is `01a12bc2-907a-7702-b6dd-788225c5dfe4`. This work belongs to the **next unfrozen batch**. The active 0.5.25/525.1 candidate/source `45a9e22e896b4c6238132463405b0f212bc2bb52` is unchanged. No main merge, shared CI, formal build, install, release, public endpoint or original business replay was performed by this development chat. Source branch delivery and native synthetic tests do not close production acceptance.

Next increment: preserve per-attempt identity and durable executor/business receipts so interrupted mutations can be reconciled without guessing from command text or replaying unknown operations; then verify cold start, late result, Stop and partial-write matrices. The full reliability goal is still open.
