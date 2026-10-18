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
- [x] Commit task then normally integrate rootc6c38d0f871bf10bf70784fec7d3b6e613f80ac4.
- [x] Only final postboot observer opts in using existing RPC strict bool defaultfalse; only failed connector and missing/empty status permit bounded current-boot30-record journal read. Parse complete JSON errors in memory, output only reviewed codes/counts/unknown boolean. Restart enum/NRestarts bounded metadata.
- [x] Tests: flags/default/invalid types, exact fixed read, conditions, bounds, synthetic unknown/secret redaction and original failure priority. Independent branch handoff only, no PR/dispatch/root branch update.

## Completed

Canonical2e1c522 start/task-init PASS, task2e0b9a93a then ordinary no-ff merge of exact rootc6 at0b7acb282. Root explicitly extended ownership to the existing guest runtime RPC handler and adjacent test for strict optional include_startup_errors bool/defaultfalse; no new RPC or command whitelist. Only the final postboot observation opts in. Initial cancel/authorize snapshots remain opted out.

Only loaded+failed connector with PID0 and empty/missing status permits the fixed journalctl --boot=0 --unit=moxbot-host-network-test.service --lines=30 --no-pager --quiet --output=json --output-fields=MESSAGE read. Selector deadline2s and64KiB cap bound raw memory; only this diagnostic reader may be terminated on overflow/deadline, never a product process. Each complete journal JSON record contributes only if its entire MESSAGE decodes as a status=error JSON object. Known codes become static enum counts (at most30); unknown values become one boolean; raw text/metadata/IDs/URLs/credentials never survive. Static additional startup codes have P2 source provenance in cli/owned_login/owned/status/state/owned_state/management_ipc and CryptoError Display. No product fix.

Existing fixed systemctl show gains Restart closed enum and NRestarts capped numeric (over1,000,000 becomes unavailable). No guest command allowlist changes. Original postboot90s gate and error precedence remain; journal access is after the original wait and before original cleanup. Observation failure remains boolean-only.


Source-only hypothesis: cli execute calls owned::Connection::discover (including real HTTPS instance discovery) before connector::run_owned and its management socket/run/reconnect loop. Guest re-establishes the loopback forward after observing the new boot. A discovery failure before that forwarding is restored could therefore exit before status/socket creation; template Restart=on-failure has no explicit RestartSec. This is not the observed startup code and is not yet a product root cause. Other credential/path/pin/lock startup errors remain possible. No product repair is authorized here.

## Verification

- python3 scripts/host/browser-acceptance.test.py:51 PASS4.258s. Includes full error MESSAGE matching, code/count redaction, unknown codes and synthetic secrets,30-record and64KiB caps, fixed argv/currentboot unit,2s deadline and owned-reader cleanup, conditions/default/invalid flags, Restart unknown/count overflow and unchanged original failure priority.
- python3 scripts/host/host-reboot-acceptance.test.py:14 PASS0.093s. Defaultfalse/strictbool wiring covered with invalid values refused before observer invocation; only existing RPC.
- git diff --check PASS. No actual journalctl, install, guest, product build, CI or external model invoked by this worker; collector tests use synthetic Python children with Popen substitution.
- Read-only summary/source review. No raw real journal has been fetched by this worker. Necessary static startup codes are taken only from P2 cli/owned_login/owned/status/state/management_ipc and CryptoError display mappings; arbitrary unknown codes stay boolean-only.

## Blockers and unknowns

Actual closed startup code remains unknown until root rerun. Existing journal prohibition is overridden only for this fixed unit/current boot/last30 bounded readonly diagnostic, raw data stays memory-only and never in output/artifacts. Actual model/usage unknown, external models0.

## Next step

Root reviews the immutable independent branch head, then alone dispatches the same P2 KVM artifacts from this harness branch. Do not update/cancel nearly complete PR137 CI just for diagnostics; root later normally integrates the final diagnostic/product delta when the actual startup code establishes the failure branch.
