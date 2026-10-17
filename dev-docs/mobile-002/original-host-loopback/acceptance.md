# Original Host mobile loopback (in progress)

Scope: actual `src/host/main.ts` fork of actual `host-session-worker.ts`, original
SessionEngine/SessionStore, installed SDK 0.3.296 and native child, private Unix
management IPC. Supplier responses are synthetic and listen only on 127.0.0.1.
No real model/provider/account, WSS, phone, APNs/FCM or production acceptance.

Reproduce from the repository root:

```sh
DEVELOPER_DIR=/Library/Developer/CommandLineTools node --import tsx scripts/verify-mobile-original-host-loopback.ts
```

Current acceptance Mac's verified installed Node24 command:

```sh
DEVELOPER_DIR=/Library/Developer/CommandLineTools /Applications/MoXBots.app/Contents/Resources/nodejs/bin/node --import tsx scripts/verify-mobile-original-host-loopback.ts
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

## Second actual failure: encrypted credential route projection

Primary's shared fix `6fd18b850ee62329c84a2bd1b501a8198c5d2bf1` was cherry-picked
as dependency `f027e96d` (not owned). The next fresh fixture used actual bundled
Node24.20.0 and the original encrypted credential owner reference for the custom
Provider. It failed before Session birth with
`unconfirmed / REMOTE_ADMISSION_UNCONFIRMED`:

- Evidence: `/Users/zhangshaohua/.mox-original-host-JOS6um/evidence.jsonl`, sibling
  private diagnostics; operation `14391f89-cb30-4a7f-9aeb-244ed56f82be`.
- Host PID/PGID2381 verified absent after exact group cleanup. No worker,
  sessions.json, supplier request or source outbox was created.
- Actual `resolveWorkspaceConfig(workspace, undefined, {includeMcp:false})` under
  the same isolated HOME reproduces `Host credential reference is unavailable`.
- Supervisor remote birth calls the full provider env materializer.
  `host-provider-credential:<id>` requires the worker's installed snapshot, which
  the supervisor does not hold. This precedes real fork/snapshot delivery.
  Portable Host profiles also persist the same reference form.

Primary owns a safe route-only supervisor projection repair. The fixture does
not substitute plaintext credentials, fake a worker snapshot, change provider
validation or call Session send to bypass this failure. The first unknown
operation remains untouched. The first run was Node22.23.0; only this second
run used Node24.20.0, and neither reached actual native SDK execution.

Script type checking (root config normally excludes scripts):
`node_modules/.bin/tsc --noEmit --project src/test/fixtures/mobile-original-host-tsconfig.json`
passed together with eslint on both new TypeScript files; repeat after final edits.

## Third actual failure: consumed attachment staging on duplicate send

Primary's shared projection repair `430ce91b5a72bfc81215fdd854212389236cee5e`
was cherry-picked as dependency `63b1e888` (not owned). A new Node24.20.0 fixture
actually reached main → worker → installed SDK/native child → local supplier →
original Store → generic source, then a second mobile send with actual file bytes.
The native process was observed at PID4182 beneath original worker4181 and
supervisor4176, all in the supervisor's actual birth PGID4176.

- Evidence: `/Users/zhangshaohua/.mox-original-host-t31O7a/evidence.jsonl`, sibling
  private diagnostics; failure after 3316ms, both supplier turns completed.
- Start operation `79264238-169f-48a6-ac9e-cdecdde8fac0`, send operation
  `470c3f98-1fdf-4509-9076-f0a3bc9e8856`, real Product Session
  `7cf71014-f107-4e11-a89e-2e18dba925b4`.
- The first accepted start's identical-operation retry returned its original
  receipt without another supplier call. The actual attachment send was accepted,
  the original worker's materialized file bytes matched, and its @ reference was
  present in the real SDK request.
- Same send operation with the same asset IDs then returned
  `ASSET_UPLOAD_NOT_FOUND` before original receipt lookup. The fixture's expected
  identical accepted receipt assertion remained unchanged and failed.
- Read-only inspection afterwards confirmed two original terminal observations
  in the durable outbox with the same real Session, worker generation and epoch.
  All observed PIDs4176/4181/4182/4202/4204 were absent after exact birth cleanup.

Primary will repair original receipt-owner exact-intent preflight before staging;
no stage is recreated and no unknown Session send is replayed. The fixture's
next stage also tests a genuine Host process restart and recovery of the same
pending source ID/original epoch plus accepted receipts with no new SDK dispatch.
That restart assertion is not yet executed on this red fixture.
