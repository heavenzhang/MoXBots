<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/host-connector-startup-observation-20261019 -->
<!-- git-project-sync-task:base=2e1c522737b30ca985c3df8d9110e2eec97e1682 -->
<!-- git-project-sync-task:status=in-progress -->

# Task: MOXBOTS-HOST-CONNECTOR-STARTUP-OBSERVATION-20261019

## Objective

Closed current-boot startup-code evidence for P2 KVM failure39143984499, keeping product58d5247d7692acb816f211e1af7ef1891871bd6a frozen. Canonical https://github.com/heavenzhang/MoXBots.git. Root alone dispatches/integrates/publishes. Worker owns browser harness/test plus explicitly authorized existing runtime RPC handler/default-bool wiring and adjacent reboot tests; no new RPC/command whitelist/path, product repair, installation or production.

## Acceptance criteria

- [x] Actual summary SHA748f846e5eaabbe982037b4abe481af47d08057ed3d5da4d15a515db28831913 verified. Node/runtime/registry/marker healthy; connector failed exit-code1, empty safe status, missing managementSocket; readiness90.287s. Result is not start-limit-hit.
- [x] Start/task-init from canonical2e1c522737b30ca985c3df8d9110e2eec97e1682 PASS.
- [ ] Commit task then normally integrate rootc6c38d0f871bf10bf70784fec7d3b6e613f80ac4.
- [ ] Only final postboot observer opts in using existing RPC strict bool defaultfalse; only failed connector and missing/empty status permit bounded current-boot30-record journal read. Parse complete JSON errors in memory, output only reviewed codes/counts/unknown boolean. Restart enum/NRestarts bounded metadata.
- [ ] Tests: flags/default/invalid types, exact fixed read, conditions, bounds, synthetic unknown/secret redaction and original failure priority. Push independent branch only, no PR/dispatch/root branch update.

## Completed

Source-only hypothesis: cli execute calls owned::Connection::discover (including real HTTPS instance discovery) before connector::run_owned and its management socket/run/reconnect loop. Guest re-establishes the loopback forward after observing the new boot. A discovery failure before that forwarding is restored could therefore exit before status/socket creation; template Restart=on-failure has no explicit RestartSec. This is not the observed startup code and is not yet a product root cause. Other credential/path/pin/lock startup errors remain possible. No product repair is authorized here.

## Verification

Read-only summary/source review. No raw journal has been fetched by this worker. Necessary static startup codes are taken only from P2 cli/owned_login/owned/status/state/management_ipc and CryptoError display mappings; arbitrary unknown codes stay boolean-only.

## Blockers and unknowns

Actual closed startup code remains unknown until root rerun. Existing journal prohibition is overridden only for this fixed unit/current boot/last30 bounded readonly diagnostic, raw data stays memory-only and never in output/artifacts. Actual model/usage unknown, external models0.

## Next step

Merge reviewedc6 normally, implement closed diagnostic and strict bool wiring, offline checks, then immutable branch handoff to root without updating PR137.
