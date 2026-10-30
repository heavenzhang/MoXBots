# MB-REPLAY-SCOPE-20261031 — operation-scoped recovery

Status: locally validated source; main/CI/signed package/installation/production acceptance pending existing desktop owner. User explicitly requested implementation, tests and handoff for unified release. Date: 2026-10-31 (Asia/Shanghai).

## Behavior

- Identifiable old unknowns no longer restrict the entire turn to Read/Grep/Glob. Distinct Bash/SSH verification and independent authorized actions use ordinary native permission and durable operation reservation.
- Exact unknown and protected successful tool/input hashes remain fenced, including after cold restoration. Requests are not replayed, old unknowns are not erased, and neither a successful check nor launcher exit 0 is business acceptance.
- Identifiable missing results are scoped to their operations for ordinary inference only. Current exact pending native admissions retain their eventual settlement path; an older same-hash unknown still cannot be cleared by a new success.
- Existing unknown-operation verification remains available with model recovery disabled, for both streaming and non-streaming requests. Projected recovery with unknown actions uses full original history for explicitly admitted verification. Automatic retry/failover/compaction/continuation still require clean evidence. Stop, cancelled/stale scope, corrupt/unidentifiable history, capacity and storage failures retain their original gates.
- Existing permission/plan/intent policies remain in force. No shell-text harmlessness classifier, new executor, new network surface, UI switch, schema migration or blanket approval was added.

## Verification

Commands use Node 24 and the existing dependency installation matching package-lock; no dependency or version changes.

| Check | Result |
| --- | --- |
| `vitest run --project unit src/server/openai-bridge src/server/builtin-session/model-recovery.unit.test.ts src/server/builtin-session/stream-continuation.unit.test.ts src/server/builtin-session/recovery-reconciliation.unit.test.ts` | 28 files, 581 passed; includes 13 new scoped-operation cases |
| `vitest run --project integration src/server/openai-bridge/context-recovery.integration.test.ts src/server/builtin-session/model-recovery.integration.test.ts src/server/session-transcript/stream-continuation.integration.test.ts src/server/__tests__/recovery-review-warm-idle.integration.test.ts` | 4 files, 67 passed |
| `node --import tsx/esm scripts/verify-operation-scoped-recovery-loopback.ts` | Actual SDK 0.3.296/native Bash/hooks, synthetic loopback supplier: 5 calls, 2 denials, old launch 0, verified next step 1; original unknown retained and cold ledger reload passed |
| `tsc --noEmit` | PASS |
| ESLint over the changed TypeScript and native validation script, `--max-warnings=0` | PASS |
| `node scripts/check-test-classification.mjs` | PASS |
| `node scripts/verify-agent-docs.mjs`, `git diff --check` | PASS |

Earlier test failures were expected old assertions requiring a whole-turn read-only lock, plus one integration expectation omitting the now-recorded exact-success replay denial. Updated cases explicitly assert the original unknown/success remain blocked while unrelated operations pass; no assertion was simply removed to accept an unknown outcome. Final suites above pass. Review performed by this implementing agent; no independent reviewer is claimed.

SDK contract was checked against installed `sdk.d.ts`, `sdk-tools.d.ts` and [official hooks documentation](https://code.claude.com/docs/en/agent-sdk/hooks). SDK 0.3.296 no longer offers TaskOutput; background output polling uses the existing Read tool and output file. The native smoke uses a local log fixture, not production SSH. Remote SSH-shaped input is tested through the real controller; production SSH credentials/connectivity and the installed signed app remain release acceptance.

Local durable evidence: `work/MB-REPLAY-SCOPE-20261031/validation.json`, `native-receipt.json`, and hashed logs under the MoxBot project workspace. Evidence contains synthetic test data, not business history or credentials. No paid model calls, shared CI, formal build, installation or production mutation was performed.

## Integration and release request

- Repository: https://github.com/heavenzhang/MoXBots.git; branch `codex/replay-scope-20261031`; base main `d18137e87155994c4ade3d1889d04830821a8eda`. Exact delivered SHA is in the owner handoff receipt and remote ref.
- Unit: desktop builtin client/macOS-arm64/updater; shared CI/main and version/build/sign/install/rollback owner stays `01a12bc2-907a-7702-b6dd-788225c5dfe4` (MoxBots桌面端统一打包负责人). No Host/cloud/mobile/website deployment requested.
- Related queued source: `MB-REPLAY-RECOVERY-20261030`, SHA `6cecca460a187fadaae8f852e82a97ece9eb2e28`. It introduces `preToolDenials` into `analyze` and modifies the same protectInference/adoption/ledger code. If both enter one batch, preserve those receipts and pass `preToolDenials` before this branch’s trailing `allowUnpaired`; combine, do not overwrite files. No hard dependency for this branch’s tests, but combined-candidate checks are required when integrated together.
- Owner next steps: integrate reviewed exact branch into latest main with normal CI, allocate a new immutable build, test signed warm/cold original-session verification, read an authorized test remote log/status, continue only after actual completion evidence and prove old/complete action duplicate denial. Preserve original business ledgers and histories; do not replay unknown tasks for QA.
- Rollback: no ledger schema change; strict action protection persists. Old binaries conservatively restore their older broader restriction. Reuse only the owner’s recorded prior signed artifact; never overwrite a published version/tag.

## Boundaries

Protection remains exact tool name plus canonical full input. It does not infer semantic equivalence across changed arguments or enforce arbitrary business dependencies. Do not vary arguments to evade an unknown action; use business receipts/idempotency and actual outcome evidence. An exact repeated Bash command remains protected; repeatable background observation uses native Read on the task’s output file. A full original history that still exceeds provider capacity remains a context-recovery limitation, not authority to drop constraints or retry.

UI layout unchanged: no new visual acceptance scope. Signed client, real provider/SSH, main integration and production delivery remain independently recorded by the release owner. This development handoff is not a claim of deployed behavior.
