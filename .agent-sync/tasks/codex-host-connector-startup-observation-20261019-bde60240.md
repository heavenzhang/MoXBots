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

## Product repair extension: MOXBOTS-HOST-BOOT-RECOVERY-20261019

Root explicitly extended this worker's scope after run39145714749 again failed the unchanged90s post-reboot gate. Only narrow Host/network startup/transport source, adjacent tests, direct locked dependencies and this task record may change. Root remains sole integrator/publisher/dispatcher; this worker may not SSH, inspect credentials, change production/Mac, push/merge or delegate. Earlier statements above denying product repair describe the completed observation phase, not this extension.

### Root cause and design

The observed code is OWNED_ACCOUNT_UNAVAILABLE (count4, no unknown code); Node, encrypted identity, registry and committed marker remained intact, connector exited1 with NRestarts5, status empty and management socket absent. The closed code does not reveal the actual errno or distinguish TCP from TLS. Source proves two unowned startup network gates: CLI run performs HTTPS discovery before its run lock/status/reconnect owner, and run_owned performs online account validation before entering run_context. The disposable guest restores its loopback reverse forward only after observing the changed kernel boot ID. That deterministic boot availability gap can exhaust systemd's rapid process restarts before forwarding returns. Real loopback tests reproduce the source failure and same-process recovery; they do not prove a new KVM run passed.

CLI run now assembles only from the already encrypted trusted pin. The original connector reconnect attempt owns pending-candidate recovery, captured local account-binding fences, policy projection, initial online account/grant checks and listener creation. The listener still cannot bind before online trust/session validation and the durable management grant. The original5s initial backoff, jitter, one-shot join authority and90s acceptance gate are unchanged; no CLI retry owner, fixture delay or RestartSec workaround is added.

Only positively typed availability failures can retry: deadline, explicitly recognized TCP causes, a private headless OS-DNS failure marker, or the locked hyper1.9.0 incomplete-message type during request/send. TLS errors take precedence and unknown protocol/transport/schema errors fail closed. Existing trust/credential/session/reauth/revocation/binding/grant/uncertain enrollment/rotation errors cannot be admitted by a server503. Existing pending-candidate recovery still inspects the exact original credential, signed handle and key proof; it never blindly resends a rotation or creates a replacement identity. The run-specific fence precedes recovery, including after a login changes while waiting. Relay-access expiry remains distinct from expired account authorization and can reconnect using the original live account.

The shared owned HTTP and transport seams also improve Desktop retryable metadata classification; Desktop actor ownership/reconnect code is unchanged. Reqwest remains locked0.13.2. Direct hyper dependencies were authorized by root solely to downcast the already locked1.9.0 type; both lockfile diffs add the existing package to the respective root dependency lists with no package/version change. The headless DNS adapter retains OS lookup behavior and emits no hostname or raw OS error text.

### To Do List and evidence

- [x] Verify clean assigned worktree/branch/HEAD53c3ef0b858d520c4f8b53f8d00d4c91e8938bdb and exact canonical fetch/push URL; preserve the accepted observation files.
- [x] Source repair and deterministic regression: actual run_owned refuses TCP, publishes unavailable/readyfalse, retains no management listener, waits original5s, then validates a real loopback TLS account and creates the listener in the same run. The test stops before device enrollment/business execution.
- [x] Actual run_owned regressions: bad TLS CA and saved-session401 terminate before listener creation; replacing the local binding during offline backoff terminates rather than adopting it. Pure retry table also rejects security/unknown codes even with503.
- [x] Typed DNS, confirmed timeout/TCP, invalid HTTP/unknown protocol, existing incomplete-response and secret-redaction tests. Existing signed pending-candidate/foreign handle/key/principal and concurrent-renewal tests remain in the full test run.
- [x] cargo test --locked --manifest-path src-tauri/headless-network/Cargo.toml --lib --quiet:215 PASS,0 failed,2 existing explicit fixture ignores,8.66s;217 total.
- [x] Desktop manifest metadata: cargo metadata --locked --offline --manifest-path src-tauri/Cargo.toml --no-deps --format-version1 PASS. This is lock/manifest validation, not a full Desktop build.
- [x] cargo clippy --locked --manifest-path src-tauri/headless-network/Cargo.toml --all-targets: exit0, one pre-existing too_many_arguments warning on unchanged handle_management_events atconnector.rs902. The stricter -- -D warnings run fails only on that existing warning; no suppression or unrelated refactor added. git diff --check and bounded whole-diff review PASS. Local commit is the handoff; root report carries its resulting SHA.
- [ ] Root: independent source review, normal integration, exact new source CI/candidate artifacts (P3), full standard/natural60s renewal/true-KVM-reboot acceptance. Old P2 artifacts cannot contain this repair.
- [ ] Root: authorized production delivery and real-user acceptance, tracked separately from this offline worker.

Model selection: parent requested Sol/high for repeated real lifecycle failure and security classification. Actual exposed model/token/cost telemetry is unavailable to this worker; no external-model calls or paid inference were made. Local tests use generated synthetic credentials under temporary private directories and loopback listeners; no real credentials were inspected. No production, remote host, ordinary Mac app, workflow or remote Git mutation was performed.

## Next step

Root reviews this bounded source change and its local commit, integrates normally, then builds an exact new candidate and alone runs actual KVM acceptance. Real KVM success remains unverified; raw real journal/errno has not been obtained by this worker.
