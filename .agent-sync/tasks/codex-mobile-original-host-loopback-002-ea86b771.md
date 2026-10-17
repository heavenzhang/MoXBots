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
- [ ] Actual native SDK completion, mobile.send attachment and source pointer.
- [ ] Primary independent acceptance of passing evidence.
- [ ] Owned branch commit/push handoff (primary alone integrates).

## Completed

- Task initialization b20ed9c1; parent dependency merge 04a2317c (not owned).
- Scope, first actual failure and command: `dev-docs/mobile-002/original-host-loopback/acceptance.md`.

## Verification

- eslint both new files and root `tsc --noEmit`: passed.
- Actual Host command: failed at accepted-start timeout, real committed Session
  with processing/null receipt and zero supplier calls. No Session replay.

## Blockers and unknowns

- Original receipt adoption requires a non-null ID but headless start begins
  null; primary owns production CAS repair. Fixture retains private evidence.
- No real provider/account/WSS/phone/production acceptance, all outside this package.

## Next step

- Integrate primary's reviewed receipt-owner repair as dependency, then execute
  a fresh private fixture. Do not reuse the unknown original operation to send.
- Requested model 6.1-sol/medium inherited from assignment; actual serving model,
  tokens and money cost unknown. No external model calls or further delegation.
