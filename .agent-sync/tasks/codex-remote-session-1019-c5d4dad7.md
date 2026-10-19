<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/remote-session-1019 -->
<!-- git-project-sync-task:base=6711028ce78d5a33c40ebfd66cb0f6bb69dcd13d -->
<!-- git-project-sync-task:status=in-progress -->

# Task: REMOTE-SESSION-1019 remote session timeout diagnosis

## Objective

Restore the reported remote Agent history read and preserve actionable errors. The current narrow repair corrects masking of scoped management owner errors; the original timeout remains under investigation.

## Acceptance criteria and To Do

- [x] Verify canonical repository, main baseline and isolated branch; preserve all unrelated work.
- [x] Reproduce the same native Agent entry and inspect current local logs.
- [x] Reproduce and repair the scoped management error masking defect.
- [x] 18 focused unit tests and 15 DOM tests; actual API-to-component failure/refresh/recovered-list path uses synthetic responses.
- [x] Full TypeScript and focused ESLint complete.
- [ ] CI, commit, remote main containment and source delivery.
- [ ] Installed dual-device real history reads and refresh recover successfully.
- [ ] Sole release owner publishes the next accepted candidate and records installed-version acceptance.

## Completed

`dev-docs/remote-session/timeout-1019.md` contains the diagnosis, regression evidence and limits. Native observations: installed 0.5.11; both devices online; history read returned CHANNEL_PAIR_EXISTS then REMOTE_SESSION_RESPONSE_INVALID. Historical local log reauthentication failures and later reconnect are correlated observations only.

## Blockers and unknowns

User confirmed Air0.5.11 and says the error is the same. Exact entry (reverse remote versus local owned Session) and target-side logs remain pending; no target owner fault is established. This Mac is now0.5.13, updated outside this task. The remote .local name did not resolve; no SSH was established. Keep the original timeout acceptance open; do not replace/restart the daily client or operate cloud production concurrently with the sole release owner. Complete local gates, deliver the narrow diagnostic repair to main, and resume exact remote reproduction once target evidence is available.

## Execution

Current primary agent only; zero subagents and zero external model calls. The failure path is tightly coupled and sharing the daily UI would add contention. No model switch, upgrade or cost saving is claimed. Token and cost usage are unknown. One regression demonstrated the masking failure; one implementation repair passed the focused tests.

## Verification

18 focused unit and 15 DOM tests passed; the API masking regression failed on the original implementation and passed after the repair. Full TypeScript and focused ESLint passed. PR https://github.com/heavenzhang/MoXBots/pull/159 is pending exact-head CI and merge. Native acceptance remains failed/unverified; synthetic refresh recovery is not a real desktop pass.

## Next step

Pass exact-head CI, merge without bypassing required checks and verify remote main containment. Obtain target Air version/logs and reproduce the original history read on a release-owner accepted client.

## Integration checkpoint

Original feature-head CI39241671656 passed9 checks with1 conditional skip. Main1f8148b0 merged locally; the only conflict was simultaneous append to plan.md and both records were preserved. Re-run focused API/DOM/type/lint on the merged source; final CI and remote-main containment remain separate gates.
