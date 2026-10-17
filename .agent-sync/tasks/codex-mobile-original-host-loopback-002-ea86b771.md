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
