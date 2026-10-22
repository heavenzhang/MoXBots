<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/owned-reference-admission-20261022 -->
<!-- git-project-sync-task:base=c83b4c5b41a6a72f273c90aa7f1f768d916651ab -->
<!-- git-project-sync-task:status=ready-for-review -->

# MOXBOTS-0518-OWNED-REFERENCE-ADMISSION-20261022

Parent: SALARY-RECOVERY-20261020. Canonical: https://github.com/heavenzhang/MoXBots.git.

## Objective

Resolve owned-only full references through the original valid actor without changing execution authority.

## Acceptance criteria

- [x] Verify canonical remote, main, clean prior b563 tree, input evidence hashes, and absence of a parallel owned-reference fix in refs/tasks/owner intake.
- [x] Isolate branch at actual main c83b4c5b41a6a72f273c90aa7f1f768d916651ab; start/task-init pass.
- [x] Reproduce owned-only directory selector failure through actual registry/source entry.
- [x] Resolve unique full service/network with the existing valid owned binding/actor; reject ambiguous/retired/changed/disabled identities without selected fallback.
- [x] Run risk-specific Rust regressions and necessary static checks; retain red/green evidence outside Git.
- [x] Commit reviewable feature and preserve concurrent main; remote synchronization is verified by the handoff gate outside this record. Root independent review and sole publisher integration/native acceptance remain separate.

## Blockers and unknowns

Desktop deployment owner remains 01a12bc2-907a-7702-b6dd-788225c5dfe4. Frozen 0.5.18/build518.1/source4a92 and artifacts are unchanged. No shared CI/formal build/version/GUI/runtime/business/credential/ledger changes. Calls::insert has a separate NETWORK_SCOPE_MISMATCH branch: live rejection branch is not proven. This source fix does not claim historical502/409 or full native management/remote acceptance.

## Verification

- Runtime scope: registry.rs adds only the missing owned branch before existing legacy/official resolution; actor.rs checks its existing account against the persisted connection. No changes to source.rs, Calls, protocol, capability, payload budget or downstream generation guards.
- Same-scope multiple owned principals or owned/legacy collision remain NETWORK_SCOPE_MISMATCH. Removing/mutation/identity changes remain denied; expired sessions use original OWNED_SESSION_INVALID. No selected account or first-candidate fallback.
- Rust1.92 `cargo test --offline --locked --manifest-path src-tauri/Cargo.toml --lib owned_reference_ -- --nocapture`: 7 new tests passed/0 failed (1820 filtered). Actual source entry checks Agent and exact Session selector for internal/external callers and stops before dispatch at missing source generation.
- Actual compiled binary filter `source_invoke_ --nocapture`: 2 existing legacy routing controls passed/0 failed (1825 filtered). No broad suite executed.
- Behavioral red: unchanged runtime plus new owned-only fixture failed with NETWORK_SCOPE_MISMATCH (1 failed), preserved as red-behavior.log and red-test.patch. The initial missing Swift loader in red.log is setup failure, not behavioral evidence; child-only DYLD_LIBRARY_PATH supplies the existing Xcode Swift directory.
- Static: git diff --check and Rust1.92 formatting of actor/new registry spans pass. Unrelated pre-existing formatting preserved. Full test library compiles; no formal App build/package.
- Own target is APFS-cloned from this author's earlier memory-scan test cache; ignored test resource fixtures remain only in this isolated tree and are not staged. The legacy fixture now reads selected directly instead of view(), avoiding device-ID IO. An initial reused legacy helper read the already-existing non-secret myagents device-ID; its file metadata predates this test (2026-10-11), with no state write observed.
- Three input SHA256 hashes match root assignment. Evidence: project-pointer `work/salary-recovery-20261020/owned-reference-admission-20261022/{red-behavior.log,red-test.patch,green-final.log,legacy-routing-control.log,static-checks.log,verification.json}`.
- Main advanced during tests to3f820422d8b6bc68dd69285fe157bb33669aeefb (PR188 chat navigation); all four routing/actor/source/Calls source files match the original base byte for byte before our changes. Normal merge preserved that concurrent main; only the appended shared-plan sections conflicted and both were retained. No task Rust/spec bytes changed in that merge.

## Completed

Code/local-synthetic verification complete; root independent review pending. Feature commit/push and sync gate are performed as the final handoff. Publisher integration/main/CI, any new candidate and native Air/remote authorization/invoke acceptance remain pending and belong solely to the existing publisher. Actual native NETWORK_SCOPE_MISMATCH branch trace remains unknown; this regression proves the owned registry omission, not every observed error.

## Next step

Root reviews exact pushed SHA, then sole publisher selects it only into a new unfrozen batch and records actual loaded version plus native acceptance.

Initial handoff gate correctly blocked on missing standard task section headings despite exact remote SHA/clean state; this documentation follow-up supplies the required sections without changing tested runtime bytes. Original blocked gate evidence is preserved.


## Publisher boundary correction — durable history is not current authority

The publisher supplied a real configuration counterexample after3b9: two non-removing same-service/network historical rows, one OWNED_SESSION_INVALID and one authenticated/ready. The3b9 nine green cases proved only the earlier partial contract and did not fix that actual configuration. The prior source handoff and all old evidence remain unchanged as history; it is not an accepted native fix.

- New red: history-boundary-red.log runs2 added regressions against unchanged3b9 runtime; both fail NETWORK_SCOPE_MISMATCH (0 passed/2 failed). The test patch is retained separately.
- Corrected lookup evaluates each original bound actor. Only locally proven OWNED_SESSION_INVALID, an absent actor with no unknown restore error, or absent actor with explicit OWNED_SESSION_RECORD_MISSING is excluded. ACCOUNT_BINDING_CHANGED (including changing/indeterminate bindings), trust/authorization/store/unrecognized errors still reject the entire lookup. Zero valid candidates remain rejected. No credential lookup, history deletion or selected fallback.
- RestoreOperations gains only a read-only has_connection projection; original publication lock keeps an in-progress restore from being misclassified as historical absence while its reader is between awaits. No new state/owner or restore operation is created.
- Every candidate's exact record and captured actor presence/pointer/generation is rechecked after guards, including excluded candidates. Two genuinely current actors with different principals/bindings/devices remain ambiguous. Existing removing/legacy/disabled/generation rejection remains.
- New tests cover historical expired actor plus unique valid actor, absent/invalid-restore history plus unique valid actor, unknown authority/in-progress restore refusal, and excluded candidate appearing/replaced/changing generation mid-guard. Existing ambiguity test now actually installs two valid actors, instead of assuming two durable rows are authorities.
- Evidence under the same external directory: history-boundary-red{.log,.patch}, history-boundary-green-final.log, history-legacy-routing-control.log, history-static-checks.log and new history-correction handoff. Only affected11 owned tests plus2 legacy routing controls execute; no broad suite, native/App/business/CI/build action.
- Publisher alone has reserved the next unfrozen518.2; no version/source/artifact from frozen518.1 is rewritten. Independent root review, publisher main/CI/new candidate and originalAir/native acceptance remain pending.
