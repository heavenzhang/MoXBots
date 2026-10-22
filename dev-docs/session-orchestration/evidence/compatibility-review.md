# MB-ORCH-20261022-01 — owner/plan compatibility

Base: 94a7ba4fa08d89527b7362a199fa8a850b835a30. Backend worker; no renderer/shared UI edits, commits, CI, builds, Provider requests or native-app operations.

## Decisions

- No proposal preserves original delegation and task tracking; this is not an execution/tool approval grant.
- Existing Task/Goal authority comes only from the original queue identity. A server-stamped `proposal.originTurn` in the existing ledger distinguishes unrelated owners. The proposing Task/Goal cannot bypass its own new decision. Legacy unknown proposal origin remains conservative.
- Proposal continuation queues use reserved `session-plan:` IDs. Exact current planStart/proposal/revision and original live claim checks remain required. Superseded queues cannot fall back to generic Task authority.
- Proposal origin is captured before async reads and rechecked inside metadata CAS; native/source labels or model prose cannot stamp it.
- Native/nonproposal ensure/bind record work without granting execution. Current/history proposal step IDs stay reserved; pending/retired/exact revision checks remain.
- Codex next-turn config replacement uses the upcoming queue scope, while live native callbacks read the actual current turn. Ownerless turns never inherit the process's original Task owner. Existing Query/generation/Session fences and all original permission gates remain.

## Verification

All commands use the local node_modules Vitest/ESLint binaries; no upstream network/Provider execution.

1. `node node_modules/vitest/vitest.mjs run --project unit src/server/session-engine/session-plan-policy.unit.test.ts src/server/system-prompt-cli-tools.unit.test.ts src/server/runtimes/codex-delegation-gate.unit.test.ts src/server/integrated-runtimes/dsh/delegation-gate.unit.test.ts`: **54 passed** (19 policy + 12 prompt + 6 Codex + 17 DSH). `compatibility-unit.log`.
2. `node node_modules/vitest/vitest.mjs run --project integration src/server/session-engine/task-orchestration.integration.test.ts`: **29 passed** using actual SessionStore in temporary local directories. `compatibility-store-final.log`.
3. `node node_modules/vitest/vitest.mjs run --project integration src/server/runtimes/external-session-mock.integration.test.ts -t 'Delegation compatibility on original turn owners|Native subagent confirmation lifecycle|Confirmed plan original-owner claim activation|External final dispatch lease'`: **11 passed**, 202 intentionally excluded. Covered Codex/DSH original-owner coexistence, ownerless transition, birth configuration, stale callback and exact final dispatch lease. Latest rerun in combined `compatibility-integration-final.log` (39 passed there before the final new Store race test); `compatibility-runtime.log` standalone.
4. Scoped ESLint on all 9 changed backend source/test files: exit 0, `compatibility-lint.log` empty.
5. `git diff --check`: passed.

No observed test failure in these runs. TypeScript project check is coordinated by the lead (this worker did not start a duplicate tsc).

## Acceptance boundary

Pure/real-disk/mock-native results are distinct. SDK/DSH/Codex real Provider and signed/native client acceptance remain outstanding and belong to the original release owner. IM/Inbox/source strings do not by themselves prove an independent Task/Goal scope; absent such original authority, a pending proposal remains conservative. Existing shared native-plan projection still requires explicit pinning (`ensure`) for nonproposal rows alongside a proposal; no shared projection was modified here.

Integration should update `specs/tech_docs/session_task_orchestration.md` to replace its former universal long-task confirmation wording with the scoped policy.
