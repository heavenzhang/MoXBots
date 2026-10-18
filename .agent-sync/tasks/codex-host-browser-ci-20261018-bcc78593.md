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
- [x] Implement separate real nested-KVM guest reboot lane and optional closed guest target adapter; no TCG fallback, no change to default standard/renewal product source or candidate.
- [ ] True VM reboot execution/acceptance; a connector restart does not satisfy it.
- [ ] Production account/browser/UI acceptance and public stable publication (root only).

## Completed

Owned files: `.github/workflows/host-browser-acceptance.yml`, `scripts/host/browser-acceptance.py`, `scripts/host/browser-acceptance.test.py`, this task record; root's explicit follow-up extended scope to `.github/workflows/host-reboot-acceptance.yml`, `scripts/host/host-reboot-acceptance.py` and `scripts/host/host-reboot-acceptance.test.py`. No existing installer/protocol/AuthStore/renderer/shared plan changed.

`mode` is the only dispatch input: `standard` (lab TTL86400) or `renewal` (lab TTL60). Public immutable origin/release/source/digests/service run and artifact ID are fixed. The job uses default read-only `contents:read/actions:read`; no production secret is added. A private venv installs pinned [Playwright1.58.0](https://pypi.org/project/playwright/1.58.0/). Nginx's system unit is masked before package install to prevent a default public listener; an existing active nginx is refused. The harness runs its private foreground loopback nginx only.

Lab service and Dex state/key material stay root-private below RUNNER_TEMP and are removed after owned processes/container/units stop. Original product M creates/encrypts all account state through its actual owner. The harness reads AuthStore/metadata SQLite in read-only mode only; no sessions are injected. Failed gates remain failures with only a redacted gate and cleanup status. Summary explicitly leaves true reboot, expiry and production UI untested.

The reboot workflow first opens the real `/dev/kvm`, checks API12 and successfully performs `KVM_CREATE_VM` ioctl; missing device/CPU support/permission produces an explicit blocked summary before dependency installation. It never tries TCG. If available, a QEMU `-accel kvm` guest uses the current official Ubuntu24 noble cloud-image with normal-TLS SHA256SUMS/size/checksum verification, a private qcow2 overlay and root-private cloud-init seed. The exact observed image SHA/size is reported, separate from unchanged M product provenance. Guest kernel/systemd255 and DMI UUID/nonce/profile are checked; only predefined Host systemctl/doctor/hash/status/CA/reboot operations are accepted. Private guest NAT SSH22 is permitted by root, outer SSH forwarding binds only127.0.0.1:22222. SSH host key comes from the controlled preboot seed; StrictHostKeyChecking=yes and a single pinned known-host entry are mandatory. No ssh-keyscan, accept-new or disabled host checking is used.

Outer Dex/M service/TLS/Chromium survive guest reboot. A guest-only loopback reverse forward maps127.0.0.1:24443 to the same outer lab origin, and guest OS trusts the ordinary lab CA with no candidate/public-CA argument changes. Initial badSHA/cancel/browser/repeat/connector tests reuse the same browser lane via an optional root600 private target JSON. Native cancellation sends SIGINT to the guest installer's verified PID/starttime/process group, never the outer lab. A true guest systemctl reboot must produce a different kernel boot_id, short new uptime and the same VM UUID; the coordinator reestablishes the pinned loopback SSH forward, waits for original Host autostart Ready/Node IPC, then compares all identity/config/key/account ciphertext hashes, AuthStore session and membership/key projections and zero additional login/join/renew requests. PID equality is not required across true boot. Only the explicit summary is uploaded; seed/SSH keys/CA/private disk/raw output are never artifacts.

## Verification

- `python3 scripts/host/browser-acceptance.test.py`: 8/8 pass (M exact launcher/bootstrap/index reproduction, badSHA/oversize/redirect rejection, browser origin fence, secret-output redaction, closed telemetry and non-CI guard).
- `python3 scripts/host/host-reboot-acceptance.test.py`: 8/8 pass (actual required ioctl sequence/descriptors, missing/denied KVM blockers without launching fallback, private-file permission/symlink/hardlink rejection, changed boot_id requirement versus unit restart, guarded process birth parsing and arbitrary guest command rejection/redaction). These mock kernel/SSH interfaces and do not claim real KVM/reboot acceptance.
- `python3 scripts/host/one-command.test.py`: 20/20 pass, including canceled/expired auth, interrupt/native cancel, existing partial retry, source/profile/archive/size/origin guards. These are offline evidence, not the real CI browser gate.
- `python3 -m py_compile scripts/host/browser-acceptance.py scripts/host/browser-acceptance.test.py`: pass.
- Reboot coordinator and tests also pass py_compile; both workflow YAML files pass Ruby Psych parse. No local QEMU/Lima/Docker or guest was started.
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

Reboot lane after default-branch integration: `gh workflow run host-reboot-acceptance.yml --repo heavenzhang/MoXBots --ref main` has no user inputs or production secrets. KVM unavailability is a blocker requiring a different expressly authorized disposable resource, never permission to retry TCG, change production or declare reboot passed.
