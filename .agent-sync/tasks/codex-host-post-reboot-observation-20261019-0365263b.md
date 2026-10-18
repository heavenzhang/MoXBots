<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/host-post-reboot-observation-20261019 -->
<!-- git-project-sync-task:base=8e60805e8c19073ba09ac33389a0994482c5c225 -->
<!-- git-project-sync-task:status=in-progress -->

# Task: MOXBOTS-HOST-POST-REBOOT-OBSERVATION-20261019

## Objective

Add only closed readonly post-reboot readiness diagnostics for failed actual KVM run39142568416. Canonical repository https://github.com/heavenzhang/MoXBots.git. Root owns actual CI/integration/publication; this worker edits only browser-acceptance.py, adjacent offline tests and this task. No guest repair/restart, product/artifact changes, command whitelist expansion, production or daily Mac activity.

## Acceptance criteria

- [x] Read actual private summary: P2 source58d5247d7692acb816f211e1af7ef1891871bd6a passed cancel/browser/join/Ready/repeat/connector restart and true new-boot-id gate16.975s; subsequent original90s readiness timed out. No postboot runtime projection exists, cleanuptrue.
- [x] Start/task-init from current canonical8e60805e8c19073ba09ac33389a0994482c5c225 PASS, preserving prior branch and root dirty publication document.
- [x] Normally integrate root reviewed head9ff7910a9d36fefc860ffb1c5bca81ec87fa5907 after committing this record.
- [x] Preserve exact original90s wait/identity/zero-login-join-renew checks; add final pre-cleanup runtime snapshot via existing guest RPC and bounded last-poll failure projection.
- [x] Focused offline tests for original failure/deadline and success preservation, observation failure isolation, readonly guest RPC and closed fields/no secrets. Commit/push/handoff follows for root integration.

## Completed

Canonical8e608 start/task-init PASS; taskded50b21d committed before normal no-ff integration of exact root9ff at56c0ff49f. Only browser-acceptance.py, its adjacent offline test and this record change relative to that combined input. No root checkout or publication document edited.

The original postboot wait_for(...,90) runs unchanged. Its wrapper retains a capped pollCount and only a fixed last-failure stage/exception-class projection. In finally, after the gate finishes but before original outer cleanup, one existing runtime_readiness_observation RPC stores the final units/status/NodeDoctor/registry/startup-marker metadata. The existing closed guest RPC already implements these projections; no guest command or whitelist changes. There is no per-poll heavy SSH/doctor workload. Diagnostic or save errors only set booleans and preserve the exact original exception/success DB object. Original identity/ciphertext/session/membership and zero-start/poll/callback/token/join/renew assertions remain untouched.


Source-only suspects: GuestTarget.reboot already recreates reverse forwarding and verifies its loopback listener, so missing re-establishment is not established. Connector unit has Restart=on-failure without explicit RestartSec, making early boot failure/start-limit one possible branch. Existing observer already permits Result=start-limit-hit. Management drop-in sets environment/group but no explicit service ordering; Node management connection retries and has a30s initial bound, so generic absence of a management ordering directive alone does not prove a failure. Runtime directory/tmpfiles, encrypted credential startup and Node management timing remain alternatives without actual postboot evidence. No product cause is asserted.

## Verification

- python3 scripts/host/browser-acceptance.test.py:44 PASS3.157s. Added checks require timeout90, preserve the readiness deadline error, use exactly one existing readonly guest runtime RPC, retain Result=start-limit-hit, isolate observation/save failures, redact synthetic exception capabilities and return the exact successful DB object without copying its secret fixture contents into diagnostics.
- python3 scripts/host/host-reboot-acceptance.test.py:13 PASS0.110s. No reboot helper edit.
- git diff --check PASS.
- No real installation/CI/reboot/product build/model invocation by this worker.

## Blockers and unknowns

Actual P2 postboot failure cause remains unknown. Product/candidate source stays fixed; root alone dispatches same bytes after review. External models0, actual model/usage unknown.

## Next step

Root reviews the immutable worker head, normally integrates only this bounded diagnostic delta and reruns the same P2 artifacts. Do not call true boot-id PASS a successful Ready/reboot acceptance until the original full postboot gates pass.
