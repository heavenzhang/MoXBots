<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/host-init-001-20261018 -->
<!-- git-project-sync-task:base=798f3a9c55697d4cf31dd6d894678f3a0b5da89d -->
<!-- git-project-sync-task:status=in-progress -->

# Task: MOXBOTS-HOST-INIT-001: safe first-install registry initialization

## Objective

Fix the proven fresh Ubuntu Host failure: actual Dex/Chromium authorization, device join and WebSocket succeeded, but the Node catalog rejected missing config.json/projects.json and the installer stopped before Ready. A genuinely new installation must initialize its authoritative empty registry through the Host's existing persistence lifecycle. Preserve existing data and fail closed on partial, corrupt or lost established authority. Do not seed acceptance fixtures to bypass the product defect.

Direct human scope: complete acceptance before merging main; hand publication to the existing unified cloud/Host deployment chat; never install, launch, restart, update or mutate the daily Mac client. Canonical destination remains https://github.com/heavenzhang/MoXBots.git.

## Acceptance criteria

- [x] Verify canonical repository, latest main, clean isolated task branch and original failing source path.
- [ ] Reconcile the sole implementation/integration owner with the active Host publication task before overlapping code edits.
- [ ] First creation persists real config agents[] and projects[] before the managed catalog is served; existing complete registries remain unchanged.
- [ ] Meaningful regression evidence covers genuine first start, repeat/restart, crash/interruption recovery, concurrent writers, partial/corrupt/deleted files, links and identity/config preservation.
- [ ] Primary independently reviews the actual diff and reruns focused tests and appropriate type/build/Host regressions.
- [ ] Exact candidate artifacts pass fresh Ubuntu24.04/x86_64/systemd, real Dex/Chromium authorization, auto join, actual Ready/directory, repeated same-command identity/PID preservation, renewal and reboot acceptance. Record unavailable gates separately; no mock or fixture seed may replace them.
- [ ] Required CI succeeds; integrate latest main, merge normally and verify the remote main contains the accepted result.
- [ ] Commit an exact-source/artifact/test/rollback handoff and notify the designated cloud/Host publication chat; source delivery is distinct from publication.

## Completed

- Base is remote main 798f3a9c55697d4cf31dd6d894678f3a0b5da89d. Isolated source task worktree: moxbots-host-init-001.
- Original exact M dcf8d9a source review: mobile-agent-catalog requires real config.json/projects.json and agents array; serve/install create state/home/identity but no startup registry initializer. A live isolated run established missing files with NETWORK_CATALOG_INVALID. Product M and its staged immutable bytes remain unchanged.
- Existing cloud/Host task has announced a fix; implementation ownership has been queried before any product edit here.

## Verification

- Git start/task-init gates passed with explicit user-supplied remote and exact base.
- Code, simulated tests, actual isolated integration, main delivery and production publication remain separate pending states.
- Existing dcf green CI and 101 runtime recovery do not verify this new initialization fix.

## Blockers and unknowns

- Waiting only for the active implementation lane's branch/file ownership facts to prevent duplicate work; independent review/acceptance preparation can continue.
- New candidate must not overwrite the already staged immutable dcf release ID. Existing public stable index remains unavailable until real gates pass.
- Publication target owner is thread 01a12b99-7b38-78b1-831f-9c60257d386a under canonical plan. This source task owns no production lease/write queue and performs no production mutation.

## Next step

Receive the active initialization writer's exact branch/files and establish one integration owner; review the first-creation/crash-recovery authority before implementation or integration. This branch currently contains only its own continuity record.

## Execution record

Apply ai-yaoren-local and git-project-sync. Reuse the existing implementation and independent acceptance lanes rather than create duplicate workers. No model switch, usage or monetary saving is claimed. 不调用外部原因：明确采用 ai-yaoren-local 纯内置模式。Daily Mac is excluded; bundled Node may be used solely as a compiler/test runtime without starting the app.
