<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/user-interrupt-409-20261021 -->
<!-- git-project-sync-task:base=2adf5c1d22c138d1b1c5022acc0bfd0179a78012 -->
<!-- git-project-sync-task:status=ready-for-review -->

# Task: MOXBOTS-USER-INTERRUPT-409-20261021

## Objective

SALARY-RECOVERY-20261020 follow-up. Diagnose the original40ef realtime force-send/interrupt409 without touching runtime state or broadening replay authority. Explicit repository https://github.com/heavenzhang/MoXBots.git; base actualmain2adf5c1d22c138d1b1c5022acc0bfd0179a78012 verified; isolated codex/user-interrupt-409-20261021. Root owns review/original-session oversight; solepublisher01a12bc2-907a-7702-b6dd-788225c5dfe4 owns all CI/build/version/install/release.

## Acceptance criteria

- [x] Correlate actual native user UUIDs, safe same-SID input/turn/generation events; do not infer bridge ownership from adjacent unbound HTTP logs.
- [x] Actual agent input-pump+registered MF red: after B stdin yield FIFO ownsA while global currentSourceB; cancellation of A inference can seal B and refuse its distinct new request409.
- [x] Root accepted minimal agent-session ownership boundary before runtime edits; retain all original leases/unknown/Stop/budgets/tool-once evidence.
- [x] Targeted green and scoped checks; source frozen for independent review. No old full-suite rerun or deployment.
- [ ] Independent exact-source review, feature handoff, normal main integration by root/publisher.
- [ ] Signed native user-path acceptance by the existing desktop owner; synthetic green does not close the original report.

## Completed

Native documents and same-SID logs prove B was already stdin-yielded before the old A terminal; they do not expose the cancelled HTTP lease scope. Original currentBridgeInferenceScope used global currentTurnSourceItem instead of the existing native output-owner FIFO; the original function is byte-identical in installed5164/fbfb8610 and base main2adf. Additionally the Session failover adapter pins its first root until endTurn, while a force-send survivor deliberately skips the ordinary Product terminal cleanup.

Only agent-session production wiring changes: bridge scope follows the existing native FIFO source, endTurn retires that executing binding before the original FIFO pop, and later Product cleanup cannot retire a FIFO successor. No new pop, execution owner or admission queue is introduced. Cancel-only-B keeps its existing remove-by-ID path; no-result Stop still consumes its real original FIFO owner; a failed setup with no yielded input has no fabricated FIFO slot.

Recovery current/settled live checks and SameTurnStreamContinuation require exclusive native/input ownership. A real B cannot inherit A's checkpoint or automatic continuation across await. The only exception is a scheduler-created hidden provider-text retry: an exact WeakMap source capability and matching rootQueueId must both prove the retained FIFO root. A cloned source with identical fields or a wrong root is rejected. Weak keys do not retain retired retry histories. MF/QueryGuard/action ledger/cause/Stop/absolute budgets are unchanged.

Empty FIFO does not fall back to latest input. Ordinary first input pushes its FIFO slot before SDK yield. Native same-turn markers bypass normal input setup and retain the original slot/generation. Independent direct input retains the existing generation reset; queued successors retain the existing generation but have a distinct root ID. No reset/retry permission is added.

Frozen production/test blobs: agent-session.ts `81b61699b43df1e23721772649225a0d139beb54`; builtin.integration.test.ts `068cb8b1cd83ea9f7dc05e3a081e0ddcdeb3a247`. Later task/plan edits do not change these source bytes.

## Verification

Node `/Applications/MoXBots.app/Contents/Resources/nodejs/bin/node` v24.20.0. Evidence directory `work/salary-recovery-20261020/user-interrupt-409-diagnostic/implementation/` in the WPS project-pointer work folder, not committed runtime data.

- Original RED: vitest integration builtin file, `-t 'force-steered native successor'`: expected200/received409, 1failed/152filtered. Preserved agent-mf-scope-red.log and red-test.patch.
- Reverse-patch synthetic isolation at exact base2adf: both A-before-B and A-after-B pin timings fail; FIFO-scope-only also fails both; retirement-only passes early pin but fails late pin. `ownership-isolation-red.py` and `ownership-isolation-red.json` retain source/test SHA256 and per-case reports. Own temporary detached probe worktree `/tmp/moxbots-user-interrupt-409-proof-20261021` is retained, not a publisher tree.
- Added10 green cases: two lease-pin timings; genuine/cloned/wrong-root hidden retry; B-present recovery/settled refusal; B-during-prepare refusal; cancel-only queued B; no-result Stop; pre-dispatch setup failure. A same/changed-fingerprint retries remain409 before native handoff, B's distinct request200 once and duplicate409; exact old rows are not deleted.
- Review found the same hidden-retry alias also needed original-root validation in the failure callback. Genuine retry now schedules the actual continuation then exhausts its absolute deadline: before the one-line callback fix it silently left completionTerminal undefined (1RED). After the fix it durably pauses and publishes error/agent-error, consumes the original FIFO and sends no third input. `alias-failure-red.log/json` preserve this red.
- Final affected integration command: `node node_modules/vitest/vitest.mjs run --project integration src/server/session-transcript/builtin.integration.test.ts src/server/session-transcript/stream-continuation.integration.test.ts -t 'force-steered native successor|realtime B|ordinary|Goal|successor stop|successor success|successor error|retains the original native|Query replacement|cold native|continues|continuation|executing A|executing FIFO|pre-dispatch setup authority|scheduler-proven|promoted local input' --reporter=default --reporter=json --outputFile.json=/tmp/moxbots-user-interrupt-409-regression-frozen.json`.
- Final result: 2files PASS,64tests PASS,110filtered,0FAIL. Includes all12 real-handler stream-continuation cases: ordinary/Goal original source+FIFO retained, persistence, Stop/cancel/permanent/malformed/half-frame refusal, recovery completion failure, second independent business input. Existing force-survivor Stop/success/error and cold/await replacement checks pass. No whole integration-suite rerun.
- `tsc --noEmit`, scoped eslint on both changed TypeScript files with max-warnings0, test classification and git diff --check PASS. Final logs and machine JSON copied beside the source diagnosis. Intermediate incomplete fix/fixture/type failures are preserved separately and not counted as passes.

All new provider execution is an in-memory synthetic executor and temporary HOME; the reused continuation fixture owns ephemeral loopback HTTP. No paid model, original business, GUI, process signal, production configuration, ledger mutation, build or CI was run.

## Blockers and unknowns

Actual old HTTP lease scope/fingerprint was not logged; causal match to this precise ordering remains an inference, not direct trace proof. Native B's409 is real, but synthetic green does not claim its original HTTP binding was observed or that the running App is repaired. The signed native acceptance must use a fresh isolated QA case under the sole publisher's authority; no original successful action is replayed. Runtime remains outside this developer lane.

Pre-handoff fetch observed main advanced to c237d5684beebaf70b17ebf3f4c0f40f59d719d7 with the auto-route lane. This task keeps its exact reviewed base2adf; it does not claim tests on the new combined main. Read-only comparison shows added autoBackup/routeAssist wiring but unchanged FIFO and root pin/endTurn contracts; root/publisher must integrate and recheck the actual combined source. No automatic merge changes frozen source bytes.

## Next step

Root/session_audit review the exact frozen source, then root/publisher integrate the feature normally and own subsequent CI/candidate/native acceptance. Affected unit is desktop builtin client; owner01a12bc2-907a-7702-b6dd-788225c5dfe4 retains version/build/install/publish and rollback. No cross-unit deployment, schema migration, new credential or permission is required. Do not modify87ae/frozen candidates/original runtime/ledger or run CI/App/native business. Actual provider usage/model cost is unknown; this task makes no external-model call or fee claim.
