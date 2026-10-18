<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/update-stop-20261018 -->
<!-- git-project-sync-task:base=4a329bf25d2f07027c0a946da552afe53fb876c4 -->
<!-- git-project-sync-task:status=in-progress -->
<!-- git-project-sync-task:scaffold=false -->

# Task: MOXBOTS-UPDATE-STOP-20261018

## Objective

Repair user-confirmed stop-and-update when a builtin Goal/Cron injected turn loses its terminal on whole-Query abort. Preserve verified termination, durable transcript and exact update transaction checks. Target repository https://github.com/heavenzhang/MoXBots.git, main; isolated checkout `/private/tmp/moxbots-update-stop-20261018`.

## Acceptance criteria and To Do

- [x] Verify actual installed version, cached update, logs, source/main and isolated task branch.
- [x] Reproduce missing terminal observer on Query abort before changing implementation.
- [x] Publish stopped only after termination and rollback, wait terminal finalization with a bounded deadline; preserve existing complete/error and reject unconfirmed termination.
- [x] Focused builtin integration and SessionEngine regressions: 160 passed; typecheck, targeted ESLint and diff whitespace passed.
- [x] Independent read-only review found missing observer timeout; added bounded wait and timeout/late-ack/token-release regressions. Independent recheck passed with explicit simulated/native boundary.
- [ ] Normal PR, CI, latest-main integration and remote main containment.
- [ ] Signed native release and actual stop-and-update acceptance through the existing unified desktop release lane.

## Evidence and diagnosis

Local 2026-10-18 unified log: 22:54:58.764 explicit interruption; 22:54:58.877 Query exit; 22:55:08.881 generation 1 UPDATE_ACTIVITY_UNKNOWN. Same generation fails again after about ten seconds on earlier attempts. Installed app is 0.5.9; 0.5.11 pending package is already cached. No private transcript or credentials copied into this repository.

`runInjectedTurn` owns an update admission until its queue item's terminal callback settles. Whole-Query abort can exit without an SDK terminal; finally clears streaming flags but leaves this observer unresolved. The selector's ten-second admission drain therefore fails. The fix uses the existing turn lifecycle's stopped/persist/observer path after verified termination, rather than clearing admission counters.

Original red test: `/tmp/mox-update-stop-red.log` (missing callback); focused green: `/tmp/mox-update-stop-tests.log`; typecheck `/tmp/mox-update-stop-types.log`; lint `/tmp/mox-update-stop-lint.log`. UI was inspected read-only in the installed native app: pending 0.5.11 restart and active sessions remain. These are runtime observations, not acceptance of this patch.

## Boundaries and next step

Existing 0.5.11 is immutable and does not include this fix. Do not overwrite it or present its installation as validation of this patch. Current client has newly active user conversations; native maintenance must preserve those and use a concrete safe stop/save window, verified package and rollback. No application install, forced quit, stable promotion, credential change or business write performed by this source fix. Complete independent review, normal CI/main delivery, then register precise release acceptance cases with the established release lane.
