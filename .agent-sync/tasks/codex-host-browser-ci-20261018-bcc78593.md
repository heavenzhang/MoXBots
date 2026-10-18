<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/host-browser-ci-20261018 -->
<!-- git-project-sync-task:base=a7ea1e91b0007d5040c11b4f76df101ab43ae24c -->
<!-- git-project-sync-task:status=in-progress -->

# Task: MOXBOTS-HOST-PUBLICATION-20261018 fresh browser CI harness

## Objective

MOXBOTS-HOST-PUBLICATION-20261018 bounded worker: manual disposable GitHub-hosted Ubuntu 24.04 x86_64/systemd255 browser acceptance. Root owns integration, dispatch, production and final acceptance. This branch never operates production, Host101 or the daily Mac, and never registers a production identity. Canonical repository is https://github.com/heavenzhang/MoXBots.git. Harness base is a7ea1e91b0007d5040c11b4f76df101ab43ae24c; product source and all product artifacts remain pinned to M dcf8d9a60976c160e2b2aca33313c668c071132c.

## Acceptance criteria

- [x] Own worktree/branch and Git sync start/task record; preserve all other work.
- [x] Implement bounded workflow_dispatch and root preflight (canonical GitHub-hosted CI, actual Ubuntu24/x86_64/PID1 systemd255, clean M source and absent fixed namespaces/accounts/units).
- [x] Separate harness checkout from M checkout. Reuse exact M immutable bootstrap/bundle bytes and owned-service run39093243842/artifact12123324723; verify source, size and SHA. No rebuild/recompression/fallback artifact.
- [x] Prepare real source-pinned Dex2.46.0 plus exact M service, synthetic lab account, normal OS/NSS CA trust, only loopback listeners and a real Chromium form/approval/callback. Candidate CA arguments and product consumer remain unchanged.
- [x] Implement actual badSHA-before-install rejection; first authorization SIGINT to M native cancel; no auth session/join/Ready plus original identity/config/KEK preservation; same-command browser resume; successful real AuthStore/DPoP/join/empty durable catalog/Ready/Node IPC; repeated command without new auth/join/rotation/identity or Node restart; connector restart; optional natural60s lab session renewal.
- [x] Only fixed, non-secret gate names and summary/hash/boolean evidence leave driver memory. No raw CLI/browser/service output, auth URL, state, code, PKCE, token, password, HAR, trace, screenshot or full journal is uploaded. Container logs are disabled; nginx telemetry has a closed alphabet and boolean proof/header presence only.
- [x] Offline checks and exact candidate byte comparisons.
- [ ] Root review, main integration and real standard/renewal dispatch after immutable files are normally TLS reachable.
- [ ] True VM reboot acceptance; a connector restart does not satisfy it. Separate nested-KVM lane requested by root; no TCG fallback.
- [ ] Production account/browser/UI acceptance and public stable publication (root only).

## Completed

Owned files: `.github/workflows/host-browser-acceptance.yml`, `scripts/host/browser-acceptance.py`, `scripts/host/browser-acceptance.test.py`, this task record. No existing installer/protocol/AuthStore/renderer/shared plan changed.

`mode` is the only dispatch input: `standard` (lab TTL86400) or `renewal` (lab TTL60). Public immutable origin/release/source/digests/service run and artifact ID are fixed. The job uses default read-only `contents:read/actions:read`; no production secret is added. A private venv installs pinned [Playwright1.58.0](https://pypi.org/project/playwright/1.58.0/). Nginx's system unit is masked before package install to prevent a default public listener; an existing active nginx is refused. The harness runs its private foreground loopback nginx only.

Lab service and Dex state/key material stay root-private below RUNNER_TEMP and are removed after owned processes/container/units stop. Original product M creates/encrypts all account state through its actual owner. The harness reads AuthStore/metadata SQLite in read-only mode only; no sessions are injected. Failed gates remain failures with only a redacted gate and cleanup status. Summary explicitly leaves true reboot, expiry and production UI untested.

## Verification

- `python3 scripts/host/browser-acceptance.test.py`: 8/8 pass (M exact launcher/bootstrap/index reproduction, badSHA/oversize/redirect rejection, browser origin fence, secret-output redaction, closed telemetry and non-CI guard).
- `python3 scripts/host/one-command.test.py`: 20/20 pass, including canceled/expired auth, interrupt/native cancel, existing partial retry, source/profile/archive/size/origin guards. These are offline evidence, not the real CI browser gate.
- `python3 -m py_compile scripts/host/browser-acceptance.py scripts/host/browser-acceptance.test.py`: pass.
- Ruby Psych parse of workflow YAML: pass. `actionlint` is unavailable locally; semantic Actions execution remains untested.
- `git diff --check`: pass.
- Current private candidate `/Users/zhangshaohua/Documents/WPS Cloud/【项目】目录/MoxBot/output/host-onboard-001/public-candidate-dcf` was read only: exact generated stable643B/SHA00961ca2d710dcbad5bc6cb0c95ad0ac4bf5be6aff801c4bf86037642da5ebce; install SHA c317033d7bf4ae77160e2a528ae83e88d4f3edd4a59f771af2b98fba10a6853b; bootstrap24272B/SHA877fff3bf5810de7d20cc9a43ac2d49b6f9c28f29a39ba61ac3f54c168040e9c; bundle171501596B/SHA304be176df11f9d4a952dab560160e7bdbe7af0c92dfa9eeeba6435cff037ae2. The harness never re-gzips this release.
- macOS direct preflight rejected `root-required` before mutation, as intended. No local VM/Docker/service/browser test was attempted.

## Blockers and unknowns

Actual CI standard/renewal execution is pending immutable URL staging and root integration. GitHub workflow_dispatch registration generally requires the workflow to be present on the default branch; root owns that merge and dispatch. Expired/missing original artifact or TLS/digest mismatch fails closed with no fallback to newer main. No fake auth server replaces Dex.

Real reboot remains a publication gate. GitHub documents nested virtualization as technically possible but not officially supported: https://github.com/github/docs/blob/main/content/actions/concepts/runners/github-hosted-runners.md . `/dev/kvm` and KVM_CREATE_VM must be probed in the actual job; absence blocks the reboot lane, never substitutes TCG/container/unit restart. Proposed guest lane leaves Dex/M service/Chromium on the outer runner, uses trusted loopback SSH reverse forwarding for guest Host's unchanged same-origin command, reboots the guest, verifies boot_id changes and same identity/key/config/credential hashes plus Ready/IPC and no new auth/join. Runtime/resource estimates (not measured):15–25min,2guest vCPU,3–4GiB RAM,~4GiB overlay. No paid runner requested.

Execution record: one bounded worker under root; no external model/paid model/business task, no delegation. Model identity/token usage are unknown. Implemented gates have not yet established browser/runtime/production acceptance.

## Next step

Root reviews the pushed immutable head, integrates under normal CI and waits for staged immutable normal-TLS full GET availability. Then dispatch `gh workflow run host-browser-acceptance.yml --repo heavenzhang/MoXBots --ref main -f mode=standard` and separately `-f mode=renewal`, inspect only summary artifacts, and preserve any failure gate. Continue separate nested-KVM reboot work without weakening this lane. Root alone decides public stable publication after all required real gates pass.
