# Original Host mobile loopback (in progress)

Scope: actual `src/host/main.ts` fork of actual `host-session-worker.ts`, original
SessionEngine/SessionStore, installed SDK 0.3.296 and native child, private Unix
management IPC. Supplier responses are synthetic and listen only on 127.0.0.1.
No real model/provider/account, WSS, phone, APNs/FCM or production acceptance.

Reproduce from the repository root:

```sh
DEVELOPER_DIR=/Library/Developer/CommandLineTools node --import tsx scripts/verify-mobile-original-host-loopback.ts
```

The command creates a 0700 private temporary directory under the current user's
home. It uses an empty isolated HOME, a runtime-generated provider credential,
the original local operator definition builder and locked provider/config writer,
the original encrypted Host credential owner, and registered ordinary Agent
workspace. The portable Host provider route is separately required to reject
loopback. Only read-only node_modules/native binary symlinks leave that directory.
Each spawned process is detached and cleanup signals its exact birth process
group, never executable names. Failures retain private logs/config for diagnosis;
do not upload them. `evidence.jsonl` and `diagnostics.private.log` are printed at
the end and remain 0600. Successful fixture retention is also explicit for review.

## First actual failure: f6 checkpoint

At parent checkpoint `f6ffc3990c804070bad99b113bfa34f7c4341bd8`, the first original
Host run reached real Session birth, but no turn admission. Private evidence:
`/Users/zhangshaohua/.mox-original-host-vcB4ZS/evidence.jsonl` and sibling
`diagnostics.private.log`. Its exact operation/session were:

- operation: `7745994c-71ba-4dbf-9ad4-bd8009b9db0c`
- Product Session: `917be33f-8e71-4ad2-a306-edd0ecd37738`
- Host/worker birth PID: 95904/95905, shared PGID 95904. Both were terminated by
  fixture cleanup; exact PID inspection afterwards returned no processes.
- Original receipt stayed `processing`, `sessionId:null`; supplier calls: 0;
  generic source files: 0. The fixture failed `FIXTURE_TIMEOUT:accepted start`.
- Original sessions.json contains the actual committed Session, workspace,
  custom permission mode, exact provider/model route, and integrated
  `claude-agent-sdk` binding with implementation version 0.3.296. No fixture
  writes Session metadata, transcript, terminal event or source pointer.

Root cause: `main.ts` begins the mobile start receipt with `sessionId:null`;
after creating the real Session it calls `adoptPrepared` with the new ID. The
original receipt owner requires the stored ID to already equal that ID, so
adoption fails. `admitHeadlessMobileStart` catches the loss and returns the old
processing receipt. The owner heartbeat keeps it processing. No send is replayed.
Primary owns any production repair; this package does not relax adoption checks.

Fixture setup failures fixed before this run: isolated cwd could not resolve
tsx (read-only node_modules link); original `handleModelAdd` saved the definition
then required absent desktop-wide invalidation (use its original dry-run
definition builder plus original locked `saveCustomProviderFile` writer). The
local custom provider also explicitly references the original encrypted Host
credential owner via the original config writer; no credential bytes enter Git.

## Gates and evidence boundaries

Canonical main start was genuinely performed at
`9269dd8c52c423a180bfba366c8f0434a90db005` after preserving the original f6 branch
as `codex/mobile-original-host-loopback-002-parent`. `start` and `task-init` passed.
Owned task initialization: `b20ed9c1`. Normal dependency merge of exact f6:
`04a2317c`. Parent implementation/owned diff baseline remains f6; the dependency
merge is not an owned test change and must not be cherry-picked as one.

Initial eslint for both new TypeScript files and root `tsc --noEmit` passed.
Actual mobile.start/SDK completion, mobile.send/attachment, generic notification
source, result artifacts, restart and real native/production paths remain open
until a passing execution is recorded. Earlier synthetic/helper test counts do
not close this actual Host gate.
