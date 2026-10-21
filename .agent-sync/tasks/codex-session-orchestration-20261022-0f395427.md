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
- [ ] Commit, synchronize latest main and verify remote main includes work.
- [ ] Hand exact SHA/evidence to existing desktop publisher; native acceptance remains owner gate.

## Acceptance criteria

Execution events update the associated task without another model plan update. A returned child is awaiting_review; completion requires explicit main-Agent acceptance of the current attempt with evidence. Retry retains task ID, uses a new attempt and does not inherit a previous review. Duplicate events/actions are idempotent; late old-activation events cannot overwrite new work. Reconnect restores durable task/binding/review history; failed synchronization retains confirmed state visibly. No title-based inference, implicit native-inactive success, new executor, model call, or external message authority.

## Verification

Node24 + reused local dependency symlink (not clean-install evidence). Focused pure/DOM/actual SessionStore disk suite: 133 passed. UI/TabProvider owner regression:130 passed (overlap with focused cases; do not add counts). Native adapter/gate unit42; original external guard/Stop16; actual builtin rollback3; DSH async-final-boundary1; once-entry1; actual original queue activation2 passed. TypeScript clean prior final guards; final scoped lint/build checks recorded in delivery evidence. Web/server/CLI builds passed. lint:deps has0errors/18existing warnings; classification and agent-doc checks pass. Two six-combination actual-component browser matrices pass; parent viewed screenshots. Independent review is in dev-docs/session-orchestration/review.md.

Rust authority module uses existing P256 dependency and passed isolated same-source compile+6tests. Whole repository cargo test is BLOCKED by pre-existing missing CLIProxy resources/manifest-v1.json, not bypassed. Signed desktop/native/Provider and production acceptance are NOT run here. Native DSH hook readiness and Codex idle permission snapshot behavior remain release gates. Unknown recovered claim is not an execution grant and is not blindly replayed.

Implementation evidence: SessionStore original metadata CAS, trusted root exact-command review receipts, original Runtime lifecycle events, native entry final guard and one-shot fence. Protocol and boundary documentation: specs/tech_docs/session_task_orchestration.md.

## Deployment request

Required: desktop/macOS/updater, sole existing owner 01a12bc2-907a-7702-b6dd-788225c5dfe4. No new version allocated here. Current516.8 frozen release excluded; next unfrozen batch only. User authorized messaging that owner; preparation notification sent, not publication proof. Native task→delegate→return→review, interrupted retry and reconnect acceptance required on the final signed artifact. No cloud/mobile/website deployment and no daily client restart in this task.

## Next step

Commit/push the frozen task branch, run git-project-sync handoff gate, then send exact SHA/evidence to existing combined CI/main and desktop owner for automatic PR CI, main integration and later unfrozen publication. Verify remote main contains the accepted commit before declaring source delivery. No native/production completion claim before owner acceptance.
