# MB-ORCH-20261022-01 verification and intake

## Fixed source and results

The implementation and compatibility fixes are committed; the task branch deliberately incorporated main263b1cf5 (desktop5168). Integration merge a76ac2f54975028e3bfd078b39a06923bdaa7899 is the frozen execution/UI source for the final broad local matrix. A later metadata-projection-only refinement removes the ledger from generic Node/Rust history output; it does not change task execution and has a separate affected-path check. Read the branch's actual final HEAD for intake; never use the first984d0c929 intermediate commit as a candidate.

| Check | Actual result | Boundary |
|---|---|---|
| Original external/builtin/DSH protocols, task ledger, UI and TabProvider | 54files passed,1038cases passed,19native cases skipped (55files/1057cases discovered) | actual SessionStore/adapters with fake native/SDK and DOM; no live Provider |
| CLI, sidecar routing, SSE, system prompt and SessionEngine | 7files,494passed | local unit; overlaps are not a grand total |
| Feedback revision turn + plan card | 2files,38passed | real temporary SessionStore and actual React; includes once-only revision discussion without formal task creation |
| Metadata wire / Session reads / activity | 3files,40passed | generic histories omit ledger; dedicated Session snapshot remains authoritative |
| TypeScript / scoped ESLint / diff whitespace | passed | Node24, reused local dependency symlink; not a clean install |
| dependency-cruiser |0errors,18existing warnings | includes orphan warnings; no requirement lowered |
| test classification / Agent docs | passed | current source categories and links |
| web / server / CLI builds | passed | local JS build only; no signed app produced here |
| Task/plan browser matrices | 1280/390/320 × light/dark, all pass | actual components with explicit synthetic protocol; two matrices, not live deployment |
| Native user-action proof | same-source isolated Rust compile +6passed | existing P256 dependency; private key stays in Rust |
| Whole-app Rust | NOT passed: missing packaged CLIProxy manifest-v1.json stops build script | unchanged resource gate; not bypassed |

Broad reproduction: Node24 `npx vitest run --project integration src/server/runtimes/external-session-mock.integration.test.ts src/server/session-transcript/builtin.integration.test.ts src/server/integrated-runtimes/dsh src/server/session-engine/task-orchestration.integration.test.ts --project unit src/server/__tests__/codex-app-server-protocol.unit.test.ts src/server/integrated-runtimes/dsh src/server/runtimes/codex-delegation-gate.unit.test.ts src/server/runtimes/claude-code.unit.test.ts src/shared/sessionTaskOrchestration.test.ts src/shared/sessionPlanConfirmation.test.ts src/server/session-engine/user-action-proof.unit.test.ts src/server/routes/session-task-orchestration.unit.test.ts --project dom src/renderer/context/TabProvider.activity.test.tsx src/renderer/components/agent-status`.

Local raw logs are /tmp/moxbots-orch-final-regressions-green.log, /tmp/moxbots-orch-protocol-regressions.log, /tmp/moxbots-orch-revision-turn-final.log, /tmp/moxbots-orch-metadata-projection.log, /tmp/moxbots-orch-tsc-merged.log and /tmp/moxbots-orch-build-{web,server,cli}-merged.log. Committed browser JSON/screenshots and isolated Rust log are under evidence/; review.md identifies the exact synthetic scope.

## Failures retained and repaired

The first expanded run found4legacy early-terminal async-answer failures plus7DSH fixture failures (and the browser component expectation,12total). The original async-answer assertions were retained: promotion is settled from successful native consumption for compatibility paths; a required final validator omitted by a Runtime remains fail-closed/unknown and never releases an uncertain claim. The new negative test covers that cleanup order. DSH fixtures now explicitly attest the fixed required hook instead of accidentally testing an unsupported native. The same complete matrix passed after these repairs.

Primary flow review also found feedback could be saved while the root stayed idle. Revision feedback now uses the same original engine queue and one-shot ledger claim with purpose=revision, never creating formal tasks or granting delegation. Tests cover duplicate requests, a revised draft and subsequent human execution confirmation.

## Intake and remaining acceptance

Desktop/macOS/updater and combined CI/main remain owned solely by01a12bc2-907a-7702-b6dd-788225c5dfe4. No shared workflow, PR CI or deployment was manually started by this development chat. The owner creates/co-ordinates automatic PR CI and actual main integration. Source handoff does not mean publication.

Do not append this work to frozen5168. For the next unfrozen batch, pin exact final source SHA, prepare existing native resources, compile whole Rust, and verify the signed artifact against source/artifact digest. Required real paths: unconfirmed delegate denied; exact native UI/chat confirmation starts once; child return awaits root review; root rejection/retry and late old report; disconnect/restart unknown/receipt reconciliation; DSH hook-ready receipt and Codex idle-boundary permission snapshot. Original current-turn Codex authorization cannot be instantly revoked by changing feature flags. No live Provider/native or production acceptance is claimed here.

Execution: one accountable primary and two bounded local workers, separated by native/event ownership and UI/proof review. Parallel work was selected for independent boundary analysis and distinct files; the primary integrated, rechecked and fixed the full paths. No model escalation or external AIRouter calls were needed once local evidence isolated the issues. Token usage, monetary cost and quantitative savings were not measured.
