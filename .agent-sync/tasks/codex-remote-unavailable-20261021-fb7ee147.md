<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/remote-unavailable-20261021 -->
<!-- git-project-sync-task:base=29cb959d784d868190c03181ae8f3fc79490e6b2 -->
<!-- git-project-sync-task:status=in-progress -->

# REMOTE-UNAVAILABLE-20261021

## Objective

Fix same-account remote Session access for registered visible workspaces whose Proactive Agent mode is off. User reports 0.5.15 login succeeds but the remote sales workspace on Mac-mini-2.local returns REMOTE_AGENT_UNAVAILABLE.

## Acceptance criteria and To Do List

- [x] Verify actual repository/main/worktree and designated desktop owner. Base main29cb959d; clean isolated task worktree.
- [x] Read-only local target diagnosis: registered matching workspace, proactive enabled=false, visible and not archived; pure authoritative registry projection reports no identity conflict. Installed5158 and main both incorrectly reject this combination. Screenshot does not establish a new end-to-end remote request trace.
- [x] Reproduce old guard failure before source repair: history/manual-message and artifact regressions fail; remaining21 tests pass.
- [x] Remove only Proactive enabled guards in desktop Session and artifact paths. Preserve target network-precheck, same-account/mount, conflicts, visibility/archive, Session workspace, generation, receipts and Stop authority. Do not mutate config, proactive switches, credentials, running processes or business sessions.
- [x] Local regression71/71 across12 files; final strengthened affected tests23/23; full TypeScript, scoped ESLint and git diff --check passed. Existing history, explicit dispatch with proactive off, real-file artifact resolution and denial/ownership/generation boundaries verified; primary reviewed diff.
- [ ] Commit/push precise branch and pass handoff gate.
- [ ] Existing desktop owner integrates under required CI and verifies remote main contains repair.
- [ ] Existing desktop owner publishes new immutable candidate, then verifies original remote history/refresh/manual send with controlled identity/data on both endpoints. No signed-client or production acceptance claimed here.

## Evidence and states

Implementation: desktop.ts/assets.ts plus adjacent regressions. Contract: specs/tech_docs/remote_agent_session.md. Private filtered evidence and logs: WPS MoxBot/work/remote-unavailable-20261021. No secrets or raw business data committed.

Source/local validation and installed-client/production evidence are separate. No UI change; browser layout review is not applicable. No new cloud/Host/mobile/Windows deployment is requested. Node desktop paths are consumed by mobile remote access as well; their tests run with the local regression pool.

## Deployment request and ownership

Affected unit: MoXBots desktop, target-side server bundle. Sole CI/deployment owner: 01a12bc2-907a-7702-b6dd-788225c5dfe4, per existing project designation and human AGENTS instructions. Submit precise remote commit to next unfrozen batch; do not rebuild/relabel frozen5163 or published5158. Source branch push alone does not trigger required Test CI; PR/main do, so only the owner creates PR/integrates. No independent shared CI, version allocation, build/install/restart/publication by this task.

The target that hosts the remote Session needs the repaired bundle; upgrading only the viewing controller cannot change a target-side rejection. Owner must coordinate target safe-idle/backup/rollback and real two-device acceptance. No need to enable proactive jobs as a workaround.

## Execution record

Primary current chat01a15c48-5b89-7522-8730-28939d4aaed9; single-agent because the policy change is bounded and context-coupled. No subagents/external models. Token/cost accounting unavailable; no model-switch claim. Current app/data retained unchanged by this task.

## Next step

Finish local checks, commit/push and send precise handoff to designated desktop owner; then verify owner main/publication evidence. Until target-side signed package and original two-device read pass, report source ready with runtime acceptance pending.
