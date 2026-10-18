<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/host-one-command-installer-20261018 -->
<!-- git-project-sync-task:base=9269dd8c52c423a180bfba366c8f0434a90db005 -->
<!-- git-project-sync-task:status=in-progress -->

# Task: MOXBOTS-HOST-ONBOARD-001 immutable installer source and release preparation

## Objective

MOXBOTS-HOST-ONBOARD-001 installer worker. Canonical remote
`https://github.com/heavenzhang/MoXBots.git`, exact base
`9269dd8c52c423a180bfba366c8f0434a90db005`. Exclusive `scripts/host/` source/tests;
primary owns UI/integration, native worker owns session renewal, unified deployment
chat owns publication/release. No production/101/82/140/daily Mac operations.

## Acceptance criteria

- [x] Fixed Ubuntu 24.04 x86_64 / moxbot-test public entry source and strict same-origin HTTPS release-index contract.
- [x] Verify staged immutable bundle, exact clean equal-source metadata, component hashes/sizes/modes and safe archives before execution.
- [x] Reuse unified install lock/rollback through browser auth, same-principal renewal, explicit join, boot activation and HostID/Node IPC readiness.
- [x] Same-version installed/authenticated path does not rotate keys/login or restart Node; canceled/partial states recover with the same command.
- [x] Offline TLS/synthetic candidate, hostile input, rollback/concurrency and orchestration regressions.
- [ ] Integrated final source and real Ubuntu/systemd/browser acceptance (primary).
- [ ] Final same-SHA real Host/native artifacts, prepared candidate, public availability and production release (unified deployment owner).

## Completed

- `one-command.py`: maintained stable shell generation source, bounded TLS downloader, immutable bundle consumer and enrollment orchestration. Trust is normal verified same-origin HTTPS plus SHA-256 integrity; no publisher-signature claim.
- `prepare-release.py`: clean-source/equal-SHA artifact validation and atomic new candidate tree containing actual index/review metadata. Refuses overwrite and emits no fabricated published availability.
- `network-control.py`: shared installer/control transaction lock, identical IPC run without restart, idle guard before new IPC restart and rollback without interrupting a busy Node.
- `README.md`: exact frozen schema and isolated Ubuntu acceptance/runbook. Existing manual controls remain operator recovery APIs, while the public flow performs the chain automatically.

## Verification

- `python3 scripts/host/one-command.test.py`: 20 passed, including real loopback TLS/CA verification; synthetic candidate generation/round-trip; platform/source/profile/digest/size/redirect/archive rejection; login/join recovery, no automatic auth on transport/corrupt failures; cancellation; lock retained across child installer and browser flow.
- `python3 scripts/host/network-control-daemon.test.py`: 8 passed, including unchanged Node PID path and busy refusal without rollback restart.
- `python3 scripts/host/network-install.test.py`: 30 passed, updated existing fixture to supply actual idle doctor response.
- `python3 scripts/host/unified-install.test.py`: 11 passed, existing snapshot/rollback/shared lock coverage.
- `node --test scripts/host/install.test.mjs scripts/host/bootstrap.test.mjs`: 31 passed.
- Python compilation and `git diff --check`: passed. Tests use local fake/synthetic inputs and root/systemd fixtures; no real account/model invocation.

## Blockers and unknowns

- No actual immutable public candidate can be declared until combined clean final-SHA Node/native artifacts exist. Source preparation and synthetic round-trip are implemented/tested; publication remains unavailable until deployment owner publishes real bytes.
- Real Ubuntu VM/systemd/browser/Node IPC and reboot acceptance belong to primary. No real target was accessed by this worker.
- Native wait must reject foreign principal before encrypted-account publish; primary reports the renewal worker has implemented that fence. This worker did not change Rust/service renewal sources.
- Model/token/cost telemetry was not exposed to this worker; usage/cost and savings are unknown.

## Next step

- Cherry-pick this branch's installer commit into the primary integration branch, run the listed tests plus native/UI checks, then build same-final-SHA real artifacts on isolated Ubuntu and run the README acceptance path. Do not publish synthetic metadata.
