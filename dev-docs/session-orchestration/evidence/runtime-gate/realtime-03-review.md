# ORCH-REALTIME-PLAN-ADMISSION-03

Task MB-ORCH-20261022-01; source parent `0ba3dae86789f84abd9fda55ce7f370f0cf5d1ba`. The existing sole main/CI owner closed01/02 and found a separate realtime route. This successor changes seven backend/adapter/test files plus documentation; no renderer, native binary, version, install, Provider, shared CI or release operation.

## Source correction and primary review

The active original Product Session, queue generation, native process/runtime, runtime session, execution turn/start and trusted Task/Goal owner are captured before realtime preparation. `assertSessionPlanRootDispatch` runs at entry, after optional asynchronous guard, and in the synchronous `beforeNativeDispatch` callback. New caller/source text cannot grant a different owner. Codex consumes that callback after building params and immediately before `turn/steer`; DSH consumes it after canonical input plus its existing asynchronous durable fingerprint/intent callback and immediately before `turn/followUp`. DSH additionally rechecks its active native operation after preparation.

Known-unsent rejection awaits guard rollback/cancellation; a provably unsent DSH durable input settles cancelled, with failed settlement kept for reconciliation. Once native entry may have occurred, existing unknown receipt handling is preserved. Definite native unavailable rejection uses the original turn-boundary queue fallback. ACK remains admission only; native user echo and original finalization remain consumption authority. Independent original Task/Goal and no-proposal realtime input stay available. Root independently inspected these source paths and the assertions below; no additional source finding remained in this delta.

## Red and green evidence

- RED: five integration cases accepted incorrectly before the fix: pending/revising/unknown claim, plan appearing during async guard, and plan appearing during adapter preparation. Actual Codex adapter unit also failed because it did not invoke the validator before RPC.
- GREEN final integration: **280/280**, three files:240 mock-native lifecycle,39 actual temporary SessionStore,1 actual DSH adapter with synthetic host. Covers the prior267 pool, new original-owner/stale tests and DSH adapter fence.
- GREEN unit: **34/34**, three files. Codex rejected before RPC and ordinary input recorded exactly `validate → rpc` once. DSH synchronous native fence follows its distinct async fingerprint callback.
- After const-only lint cleanup, **14/14** affected integration checks passed; these overlap the280. Includes late ACK ordering and stale Session/turn/process/queue generation/lease.
- Final `tsc --noEmit`, seven-file ESLint and `git diff --check`:exit0. Local server and CLI esbuild:exit0. Dependencies were reused; this is not clean-install or whole-app Rust evidence.

First wider run had278PASS/1FAIL: the FakeRuntime had put the new validator after its delayed RPC-reply gate, incorrectly modelling an already dispatched request as unsent. The fixture now invokes the validator before recording native input and waiting for ACK; the separate async-preparation race is retained. The original late-success ordered-persistence assertion and final full280 pass. Initial test spy typing and prefer-const issues were corrected; no product assertions removed. Red, first failure and final raw logs remain in the local `/tmp/moxbots-orch-realtime-03/` directory.

## Reproduction

Use the repository's supported Node24 and installed dependencies, without native credentials:

```sh
node_modules/.bin/vitest run --project integration src/server/runtimes/external-session-mock.integration.test.ts src/server/session-engine/task-orchestration.integration.test.ts src/server/integrated-runtimes/dsh/runtime-steer.integration.test.ts
node_modules/.bin/vitest run --project unit src/server/runtimes/codex-delegation-gate.unit.test.ts src/server/integrated-runtimes/dsh/runtime-steer.unit.test.ts src/server/session-engine/session-plan-policy.unit.test.ts
node_modules/.bin/vitest run --project integration src/server/runtimes/external-session-mock.integration.test.ts -t 'late successful steer admission|realtime .*change|realtime Codex|fresh-checks realtime|independent original.*owner'
node_modules/.bin/tsc --noEmit
node_modules/.bin/eslint src/server/runtimes/external-session.ts src/server/runtimes/types.ts src/server/runtimes/codex.ts src/server/integrated-runtimes/dsh/runtime.ts src/server/runtimes/external-session-mock.integration.test.ts src/server/runtimes/codex-delegation-gate.unit.test.ts src/server/integrated-runtimes/dsh/runtime-steer.integration.test.ts
npm run build:server
npm run build:cli
git diff --check
```

## Remaining delivery

The designated existing owner `01a12bc2-907a-7702-b6dd-788225c5dfe4` must delta-review the exact pushed successor, coordinate original shared CI/protected main integration and choose the next unfrozen publication. Published518.2 and the separate frozen519.1 batch are not changed by this source. Signed/native SDK/DSH readiness, unsupported Codex/CC native inputs, real returned→root review, retry/reconnect/unknown receipt and production business acceptance remain separate release gates. No native skips are counted as passes.
