<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/mobile-original-host-loopback-002 -->
<!-- git-project-sync-task:base=9269dd8c52c423a180bfba366c8f0434a90db005 -->
<!-- git-project-sync-task:status=in-progress -->

# Task: MOXBOTS-MOBILE-002 original Host mobile Session SDK loopback

## Objective

Verify original Host main/worker/SessionEngine/Store mobile admission, receipts,
real attachment bytes and generic notification source with a controlled local
supplier and actual installed SDK/native child. No production changes or calls.

## Acceptance criteria

- [x] Canonical 926 start/task-init; normal exact parent f6 dependency merge.
- [x] Original Host and Session birth, private IPC and receipt failure reproduced.
- [x] Actual native SDK completion, mobile.send attachment and source pointer.
- [x] Real Host restart recovers same source ID/original epoch and accepted receipts, no new SDK call.
- [x] Primary independent baseline loopback acceptance (4213ms, before restart increment).
- [ ] Primary independent acceptance of final restart increment.
- [ ] Owned branch commit/push handoff (primary alone integrates).

## Completed

- Task initialization b20ed9c1; parent dependency merge 04a2317c (not owned).
- Scope, first actual failure and command: `dev-docs/mobile-002/original-host-loopback/acceptance.md`.

## Verification

- eslint both new files and root `tsc --noEmit`: passed.
- Actual Host command: initial three red fixtures retained; final original
  Node24 main/worker/SDK/Store/attachment/source/restart PASS3631ms, two supplier
  requests, one Session, exact same-operation receipts. Evidence in acceptance.md.

## Blockers and unknowns

- Original receipt adoption failure was handed to primary; production fix
  6fd18b85 was cherry-picked as dependency f027e96d (not owned).
- Projection repair 430ce91b was cherry-picked as dependency63b1e888 (not owned).
- Exact-intent preflight repair afa157f4 was cherry-picked as dependency8134a1a7
  (not owned); final real loopback and restart passed. All three private red
  fixtures remain intact and none of their unknown operations is replayed.
- No real provider/account/WSS/phone/production acceptance, all outside this package.

## Next step

- Primary should cherry-pick owned test/record commits only (not 04a2317c,
  f027e96d,63b1e888,8134a1a7 dependencies), independently run final restart increment,
  then integrate under the parent task's PR/main gates. No deployment authorized.
- Requested model 6.1-sol/medium inherited from assignment; actual serving model,
  tokens and money cost unknown. No external model calls or further delegation.

## Successor stage: actual permission, Stop and tool artifacts

Parent authorized this test-only continuation on the same already gated tree;
starting owned-diff checkpoint b65f8ac0, same canonical926 and parent f6/shared
production repair dependencies. Do not count dependency commits as owned.

- [x] Read actual custom permission/pending/fresh projection/respond/stop and
  persisted tool attachment/list/read entry points.
- [x] New independent original Host script: wrong generation/turn/request reject,
  fresh explicit denial without file, fresh allow_once actual Bash file creation,
  actual SDK Read → original artifact list/read exact68 bytes, settled approval
  rejection, exact Stop and later stale approval rejection without file.
- [x] Original pending read-only observation emits generic source, no SDK dispatch.
- [x] Corrected PNG fixture CRC; final actual Node24 run PASS4781ms, six local
  supplier calls; private evidence and limits in interactions-acceptance.md.
- [x] Final eslint/root+script tsc all exit0; exact task branch handoff checked separately.
- [ ] Primary independent acceptance and main integration; no deployment.

Owned stage files only: scripts/verify-mobile-original-host-interactions.ts,
src/test/fixtures/mobile-original-host-interactions-tsconfig.json, new independent
interactions acceptance/evidence, and this task record. Existing passing script,
passing evidence, production owner/protocol, dependencies, parent plan and shared
workflow are unchanged. Follow-up entry: run the exact new script command from
dev-docs/mobile-002/original-host-loopback/interactions-acceptance.md.

## Successor stage: initial original Host catalog

Same genuinely start-gated branch/canonical926; owned-diff checkpoint26108f96.
Root owns main wiring/integration. No new start exception or protocol change.

- [x] Strict original identity/config/projects read-only catalog owner; ordinary
  enabled builtin projection, private/archive/unsupported filtering.
- [x] Closed local-source IPC, authority-bound bounded24KiB byte chunks, one8MiB
  snapshot/fixed30s lifetime, EOF source readback; native whole-read validation.
- [x] Managed connector initial catalog rejects failed/partial reads before Ready;
  explicitly unmanaged empty catalog remains; no execution authority added.
- [x] Node6 integration cases, tsc/eslint and full headless190 pass/1ignored.
- [ ] Strict clippy: unchanged baseline too_many_arguments in owned_login and
  handle_management_events; no warning suppression or out-of-scope edits.
- [ ] Parent main wiring and independent actual Host/service targets acceptance.

Evidence/commands/limits: dev-docs/mobile-002/original-host-loopback/catalog-acceptance.md.
Only owned catalog/IPC/connector/tests and this record are submitted; main,
passing scripts, parent plan, workflows, dependencies and frozen protocol remain
unchanged. Next: primary wires the three-line owner dispatch and independently
tests the real initial targets path. No production deployment authorized.
