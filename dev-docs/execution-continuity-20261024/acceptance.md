# Execution continuity acceptance

Task: MOXBOTS-EXECUTION-CONTINUITY-20261024. Source branch: `codex/execution-continuity-20261024`; base: `670881d8cc1b4eed2aaa66df886cdfc83f70c14f`.

## Delivered behavior

- Same-task human continuations are classified with an explicit existing `continuationOf` identity. Promotion occurs at the existing native turn boundary, under the original serialized ledger CAS. A missing classification relation grants no ongoing execution capability.
- Preserve original execution ID, original request, objective/scope/criteria, start and absolute deadline, rework/no-progress counters, real evidence, task packages and delegation budgets. Renew the current human request and queue once; discard the previous review proposal/assessment and require a fresh review. New deliverables still receive new executions.
- No fixed eight-turn cap or completion fraction. Actual progression may exceed eight turns within the existing 30-minute, no-progress, rework and delegation guards.
- Late terminals, cancelled inputs, Stop, native writes, pending interaction and unknown dispatch/persistence results are checked by exact queue and existing native authority. Only a known cancellation can resume as stopped after a real terminal; unknown receipts do not replay.
- Recovery is a minimal read-only snapshot projection for the exact builtin execution queue. No second store, scheduler, timer or inference call was added. The status card shows actual model waiting/paused state and retains terminal/unknown precedence. See renderer evidence in [UI acceptance](../session-execution-ui/acceptance.md).

## Source verification

Node 24 local checks (not shared CI):

- Unit: 182 tests across execution FSM, dispatch policy, task projection, SessionEngine facade and task route. Includes progressing execution at turn 24 without a root-turn cap and unchanged deadline/no-progress/rework limits.
- SessionStore/native-guard integration: task owner/stability 57 tests; task dispatch 14 tests; execution continuity 47 tests. Covers pending human ordering, previous-turn terminal proof, original acceptance preservation, stale callbacks/queues, repeated guard, exhausted budgets, unknown writes/claims, persistence failure, Stop-before-commit, late background/interactive state and known cancellation versus unknown ACK.
- Full TypeScript check and changed-file ESLint pass. Test classification gate passes (458 server tests; 132 integration and 6 credentialed registered). Renderer-specific DOM/i18n/browser results and exact acceptance limits are in the UI record.

Reproduce focused policies with `node_modules/.bin/vitest run --project unit src/shared/sessionExecution.unit.test.ts src/shared/sessionTaskDispatch.unit.test.ts src/shared/sessionTaskOrchestration.test.ts src/server/session-engine/session-engine.unit.test.ts src/server/routes/session-task-orchestration.unit.test.ts --silent`; integration with `node_modules/.bin/vitest run --project integration src/server/session-engine/session-execution.integration.test.ts src/server/session-engine/session-stability.integration.test.ts src/server/session-engine/task-orchestration.integration.test.ts src/server/session-engine/session-task-dispatch.integration.test.ts --silent`.

## Native SDK evidence

The credential-free `scripts/verify-session-execution-loopback.ts` launches the installed SDK, real builtin facade, production SessionStore and task CLI route. The upstream provider is synthetic loopback only; no paid model or real business session is used.

- [Single execution](evidence/native-single.json): one analysis-only native turn followed by actual Write, Read and committed root acceptance on a fresh queue; completed in 2 turns.
- [Rework](evidence/native-rework.json): actual wrong Write/Read, committed rework, corrected Write/Read and committed acceptance on the next queue; completed in 3 turns with one rework.

Run with `node --import tsx scripts/verify-session-execution-loopback.ts` and `node --import tsx scripts/verify-session-execution-loopback.ts --rework`. These receipts verify native automatic continuation and rework against synthetic upstream; the manual continuation concurrency cases use isolated SessionStore/guard integration tests. Neither is a real provider or installed Tauri business-path acceptance.

## Independent review and execution record

Primary owns shared/backend integration. Existing UI worker owns renderer presentation and fixture QA; a separate worker owns continuity regressions; an independent reviewer reads the combined diff. Review found and drove fixes for late background/interactive commit checks and recovery from a known undispatched cancellation. Their regressions pass. Primary also required recovery to replace the running label, rather than coexist with it.

Three bounded native worker lanes were reused; no new external model call was added to this mechanism. Development model usage/cost was not measured. There is one ledger owner and the existing native queue remains the execution owner.

## Mainline and release boundary

Commit and remote handoff are recorded in the source task report, without self-referential commit hashes here. The existing desktop/main/shared-CI/release owner `01a12bc2-907a-7702-b6dd-788225c5dfe4` alone selects the next candidate, merges main, runs shared CI, builds, publishes and validates the installed application. This development task does not change versions, install an application, trigger shared CI or replay the user's blocked business execution. Published `v0.5.21` / build 521.2 is immutable. Actual main delivery, release artifact and real-user acceptance must be reported separately from the local evidence above.
