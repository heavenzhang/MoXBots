<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/session-orchestration-20261022 -->
<!-- git-project-sync-task:base=85981a95b5c9a8e8736d680572e2813b1f7809fd -->
<!-- git-project-sync-task:status=in-progress -->

# Task: MB-ORCH-20261022-01 会话任务编排与执行验收状态一致性

## Objective

MB-ORCH-20261022-01: session task/attempt/acceptance orchestration. Product Session owns stable task association and explicit main-Agent acceptance through existing SessionStore metadata CAS; native Runtime/TaskGraph retain execution ownership. Existing desktop unit owner 01a12bc2-907a-7702-b6dd-788225c5dfe4 alone coordinates shared CI/build/release. User explicitly authorized implementation, main integration and handoff.

## To Do List

- [x] Confirm repository/base/clean isolated worktree and existing release owner.
- [x] Independent audit of native identity, event deduplication and history boundaries.
- [x] Implement stable task identity, attempt binding, revision-fenced root review and durable recovery, with confirmed proposal and original queue start.
- [x] Validate event/retry/replay/conflict/session isolation, exact human proof/visible revision, queue claim and final native dispatch guards.
- [x] Primary and independent running UI checks (1280/390/320, light/dark), then bounded UI implementation and primary review.
- [x] Commit/push task branch and deliberately incorporate latest main263b1cf5; handoff gate passed on a76ac2f54.
- [ ] Existing combined CI/main owner integrates; verify remote main includes final task commit.
- [ ] Hand exact SHA/evidence to existing desktop publisher; native acceptance remains owner gate.

## Acceptance criteria

Execution events update the associated task without another model plan update. A returned child is awaiting_review; completion requires explicit main-Agent acceptance of the current attempt with evidence. Retry retains task ID, uses a new attempt and does not inherit a previous review. Duplicate events/actions are idempotent; late old-activation events cannot overwrite new work. Reconnect restores durable task/binding/review history; failed synchronization retains confirmed state visibly. No title-based inference, implicit native-inactive success, new executor, model call, or external message authority.

## Verification

Node24 + reused local dependency symlink (not clean-install evidence). Final broad matrix:54files/1038passed,19native skipped; separate CLI/protocol494passed and metadata affected-path40passed (overlaps are not added). Focused pure/DOM/actual SessionStore disk suite:133passed before added revision cases. UI/TabProvider owner regression:130 passed (overlap with focused cases; do not add counts). Native adapter/gate unit42; original external guard/Stop16; actual builtin rollback3; DSH async-final-boundary1; once-entry1; actual original queue activation2 passed. TypeScript and scoped lint passed; fixed execution/UI source web/server/CLI builds passed. Full verification and remaining gates: dev-docs/session-orchestration/validation.md. Web/server/CLI builds passed. lint:deps has0errors/18existing warnings; classification and agent-doc checks pass. Two six-combination actual-component browser matrices pass; parent viewed screenshots. Independent review is in dev-docs/session-orchestration/review.md.

Rust authority module uses existing P256 dependency and passed isolated same-source compile+6tests. Whole repository cargo test is BLOCKED by pre-existing missing CLIProxy resources/manifest-v1.json, not bypassed. Signed desktop/native/Provider and production acceptance are NOT run here. Native DSH hook readiness and Codex idle permission snapshot behavior remain release gates. Unknown recovered claim is not an execution grant and is not blindly replayed.

Implementation evidence: SessionStore original metadata CAS, trusted root exact-command review receipts, original Runtime lifecycle events, native entry final guard and one-shot fence. Protocol and boundary documentation: specs/tech_docs/session_task_orchestration.md.

## Deployment request

Required: desktop/macOS/updater, sole existing owner 01a12bc2-907a-7702-b6dd-788225c5dfe4. No new version allocated here. Current516.8 frozen release excluded; next unfrozen batch only. User authorized messaging that owner; preparation notification sent, not publication proof. Native task→delegate→return→review, interrupted retry and reconnect acceptance required on the final signed artifact. No cloud/mobile/website deployment and no daily client restart in this task.

## Next step

Verify the successor task branch through git-project-sync handoff and send exact SHA/evidence to the existing combined CI/main owner for delta review, automatic PR CI, protected main integration and later unfrozen publication. Verify remote main contains the accepted commit before declaring source delivery. No native/production completion claim before owner acceptance.

## Completed

Product task/attempt/review ledger, original execution event observation, unified status UI and root-only acceptance receipts; proposal/revision workflow with native human proof and exact displayed revision, original-queue once-only claim and final native dispatch checks; retry/reconnect/late-event/unknown-state handling and architecture documentation. Source committed and task branch pushed; main integration and publication are separate pending owner operations.

## Blockers and unknowns

Whole-app Rust check lacks existing packaged CLIProxy manifest resources; prepare through sole publisher, never bypass. Real Provider/native, signed artifact and production paths have not been accepted. Expanded original-runtime regressions were repaired without weakening assertions; final full matrix passed1038 with19native skips. Whole-app/native/production acceptance and actual remote-main integration remain open. New changes never join a frozen artifact automatically.

## Approved incremental implementation — 2026-10-22

User approved the original-layout V2 prototype for implementation. Keep native tools, sent/draft attachments, queue editing/cancel/send-now, original permission cards and full Composer. Use one shared per-Chat task observer; add only native-tool associations, conversation result/review/rework actions and the unified summary. The execution/review ledger remains the existing authority.

- [x] Incorporate current remote main c8068493 without replacing other owners' committed work.
- [x] Fix universal proposal gate incompatibility in isolated source; independent backend review and tests are pending primary acceptance.
- [x] Complete integrated UI, target/attempt safety and draft/attachment preservation checks.
- [x] Validate actual production components, necessary event/retry/reconnect regressions and independent UI review (1114 broad, final9 DOM,132 component assertions; native19 skipped).
- [ ] Commit/push exact task head and pass handoff; existing combined CI/main owner integrates and selects next unfrozen release.
- [ ] Verify remote-main containment; signed/native and production acceptance remain separate owner gates.

Current source and local checks do not alter the installed client, original business tasks, 518.2 candidate or stable channel. Completion requires the user-approved incremental UI plus the originally requested state consistency; prototype approval alone closes none of the native/release gates.

Latest approved-source/evidence authority: `dev-docs/session-orchestration/incremental-validation.md`; UI source fixture `incremental-preview/`, compatibility review `evidence/compatibility-review.md`. Old6713 development hold is resolved for source intake; real native/signed/production gates remain open. Original tool/attachment/queue/Composer source owners were retained.

## Exact-source review corrections — 2026-10-22

The sole main/CI owner requested changes on 8b326d79: ORCH-CC-DELEGATION-01 (external CC never consumes the delegation callback) and ORCH-CODEX-LIVE-DELEGATION-02 (birth snapshot does not revoke same-turn delegation after propose/revise). These are source defects, not deferred native acceptance items; earlier broad/component passes did not cover that contract.

- [x] Independently verify both gaps without touching Provider/daily app, preserve original 8b review source.
- [x] Add explicit nonpersistent planSupport; unsupported plan decisions reject before any observation/write and revalidate Session/runtime in metadata CAS. Existing plans remain intact.
- [x] Fence imported pending/revision/unknown claims at original external native input boundary, preserve no-proposal and independent Task/Goal scope.
- [x] Retain task projection/ensure/bind/main review across all runtimes; disable unsupported/unverified plan confirmation and preserve feedback/records across runtime changes.
- [x] Finish concentrated regression (1165 broad +128 input/plan专项 with31 overlap,19 native skipped), final tsc/lint/local builds and independent browser review at1000/768. Evidence: dev-docs/session-orchestration/evidence/runtime-gate/fit-review.md.
- [x] Prepare exact successor source/evidence for commit/push; sole owner delta review and protected main remain next.
- [ ] Sole owner shared CI/protected main integration; verify remote-main containment; signed/native publication and business acceptance remain separate.

Current safe support is builtin SDK/Integrated DSH for new human-confirmed plan decisions. Codex/external CC need native mandatory live gate support before that additional capability can be enabled; no version inference, prompt-only grant or globally disabled legacy delegation. This limitation does not remove unified task status/result acceptance for those runtimes. No new runtime binary, formal version, shared CI or deployment is produced by the development thread.

Before successor handoff, latest remote main13b5e155e was merged without conflict. Concurrent mobile/credential diagnostic changes do not alter the locally tested renderer/server source closure. Native/whole Rust CI remains the designated owner gate; no published/source acceptance inferred from local checks.

## Realtime admission follow-up — ORCH-REALTIME-PLAN-ADMISSION-03

Sole owner delta review on0ba closed source findings01/02 by explicit unsupported plan admission, then proved a separate Codex realtime turn/steer route bypassed the new-root fence. This is a source correction, not a deferred native acceptance item. Preserve0ba and its review; isolated successor starts from exact0ba with no renderer changes.

- [x] Reproduce unsupported pending/revision/unknown plus async preparation races; original adapter accepted incorrectly.
- [x] Apply current original native owner/Session/generation policy at realtime entry and immediately before actual native RPC, preserving no-proposal and independent Task/Goal.
- [x] Validate actual adapter fence, original realtime/fallback and data/receipt boundaries: 280 integration +34 unit, overlapping14 affected; final types/scoped lint/server+CLI local build passed. Primary Agent independently reviewed original-owner capture, async preparation/native boundary and known-unsent/unknown receipt handling. Evidence: dev-docs/session-orchestration/evidence/runtime-gate/realtime-03-review.md.
- [ ] Commit/push exact successor; sole owner delta review, original sharedCI/main, then next unfrozen native/signed acceptance.

UI and capability scope remain the reviewed0ba source. The 03 tests prove synthetic actual-adapter/Store boundaries, not signed/native readiness or Provider execution; main integration and release remain pending the designated owner.

## PR192 exact-source CI follow-up

Sole owner accepted6bcd source delta and closed all three findings, then createdPR192 and first CI39766160793. JavaScript job119782017279 failed complete lint with39errors in committed dev-docs fixtures, omitted by the earlier scoped-only lint. Preserve that failure; do not rerun an unchanged candidate or weaken lint.

- [x] Repair only original prototype/ESM evidence files and references, with explicit types; no src/runtime/CI/ignore change.
- [x] Full npm lint (deps0errors/18existing warnings,74doc links), independent fixture types, local fixture build and six-combination browser270 passed. Original worker script assertions retained with2/2 normalized behavior parity.
- [ ] Sole owner incorporates exact local fix, pushes updated PR192 once and coordinates next exact-source CI/protected main; source branch and remote-main containment must be reverified.
- [ ] Later unfrozen signed/native publication and real acceptance remain owner gates.
