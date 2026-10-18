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
- [x] Reconcile the sole implementation/integration owner with the active Host publication task before overlapping code edits.
- [ ] First creation persists real config agents[] and projects[] before the managed catalog is served; existing complete registries remain unchanged.
- [ ] Meaningful regression evidence covers genuine first start, repeat/restart, crash/interruption recovery, concurrent writers, partial/corrupt/deleted files, links and identity/config preservation.
- [ ] Primary independently reviews the actual diff and reruns focused tests and appropriate type/build/Host regressions.
- [ ] Exact candidate artifacts pass fresh Ubuntu24.04/x86_64/systemd, real Dex/Chromium authorization, auto join, actual Ready/directory, repeated same-command identity/PID preservation, renewal and reboot acceptance. Record unavailable gates separately; no mock or fixture seed may replace them.
- [ ] Required CI succeeds; integrate latest main, merge normally and verify the remote main contains the accepted result.
- [ ] Commit an exact-source/artifact/test/rollback handoff and notify the designated cloud/Host publication chat; source delivery is distinct from publication.

## Completed

- Base is remote main 798f3a9c55697d4cf31dd6d894678f3a0b5da89d. Isolated source task worktree: moxbots-host-init-001.
- Original exact M dcf8d9a source review: mobile-agent-catalog requires real config.json/projects.json and agents array; serve/install create state/home/identity but no startup registry initializer. A live isolated run established missing files with NETWORK_CATALOG_INVALID. Product M and its staged immutable bytes remain unchanged.
- Existing cloud/Host task confirmed its single bounded worker owns `codex/host-registry-bootstrap-20261018`, same base, with exclusive registry-bootstrap/main wiring/admin-config lock API/tests. This primary owns integration/main and independent review; the existing cloud/Host chat owns isolated Linux/browser acceptance and later publication. There is no competing implementation here.
- Initial design accepted for implementation: original host.lock, original intent/projects/config lock order, actual first identity exclusive-creation witness or matching pending recovery; preserve complete established pair and reject partial/corrupt/lost authority. Acceptance of design does not accept unreviewed code.

## Verification

- Git start/task-init gates passed with explicit user-supplied remote and exact base.
- Code, simulated tests, actual isolated integration, main delivery and production publication remain separate pending states.
- Existing dcf green CI and 101 runtime recovery do not verify this new initialization fix.
- Primary independently ran the unchanged original catalog integration suite on this branch: 7 tests passed. This establishes the existing reader contract, not repair acceptance.
- Primary independently bundled and probed draft initializer SHA256 `92a8f1f6c6c7dd459e5e54797019cf04f7aa8c1e4176d2e637149d2ebd30943b` in synthetic private state, source unchanged during the probe. Two failed criteria were reproduced: identity persisted before pending could not resume without its process witness; losing an established identity led to publishing a new UUID before final refusal. Returned both to the same implementation owner. Draft is not accepted. Evidence is outside Git at project output/host-init-001/draft-owner-review.json and review-draft.mjs; no production, Linux binary or daily Mac execution occurred.
- Additional draft review requested validation of the private registry path before writer lock side effects and Linux temporary-parent compatibility. These require code/test resolution before final candidate freeze.

## Blockers and unknowns

- First draft is in repair after independent persistence review; ownership is resolved and no user approval is pending.
- New candidate must not overwrite the already staged immutable dcf release ID. Existing public stable index remains unavailable until real gates pass.
- Publication target owner is thread 01a12b99-7b38-78b1-831f-9c60257d386a under canonical plan. This source task owns no production lease/write queue and performs no production mutation.

## Next step

Review the initialization worker's actual diff, integrate its accepted commit into this task branch, and rerun meaningful persistence and Host startup regressions. This branch currently contains only its own continuity record.

## Execution record

Apply ai-yaoren-local and git-project-sync. Reuse the existing implementation and independent acceptance lanes rather than create duplicate workers. No model switch, usage or monetary saving is claimed. 不调用外部原因：明确采用 ai-yaoren-local 纯内置模式。Daily Mac is excluded; bundled Node may be used solely as a compiler/test runtime without starting the app.
