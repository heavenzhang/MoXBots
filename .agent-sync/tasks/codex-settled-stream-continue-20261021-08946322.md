<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/settled-stream-continue-20261021 -->
<!-- git-project-sync-task:base=e7efffe35662ebdc1e633508b4ddf17439ee4596 -->
<!-- git-project-sync-task:status=ready-for-review -->

# Task: MOXBOTS-SETTLED-STREAM-CONTINUE-20261021

Root task: SALARY-RECOVERY-20261020. Repository https://github.com/heavenzhang/MoXBots.git. Base is verified remote main e7efffe35662ebdc1e633508b4ddf17439ee4596; isolated branch codex/settled-stream-continue-20261021. Root reviews/integrates; desktop unit CI/release stays with sole publisher 01a12bc2-907a-7702-b6dd-788225c5dfe4.

## Objective and boundaries

Continue the original Session/Goal at its original native result boundary only after a clean armed durable ledger, stable whole-root request manifest, strict zero tool spill for interrupted requests, paired exact tool IDs/action hashes for delivered tools, and all background runs already authoritatively settled. Reuse SameTurnStreamContinuation and SessionModelRecovery; retain original root/id/absolute deadline and old HTTP fingerprints. No replacement recovery owner, polling, queue, timeout increase, model/permission change or clearing uncertain actions. No changes to frozen candidates, user state, original business sessions, production or App.

## Acceptance criteria

- [x] Remote/worktree/base/status verified; vendored git-project-sync map → plan → task and architecture/Session/recovery contracts read. observe/start/task-init passed for the explicit remote/base.
- [x] Production handler, Context/MF, native Pre/PostToolUse/Failure and native result wired; tool evidence revision changes before enqueue/admission; evidence maps independently bounded.
- [x] Native result supports only already-settled background. Level-only observations, unknown runs, notification-only, stale manifests and cleanup cannot impersonate authoritative task_updated terminal. Unsupported cases finalize with a fixed safe explanation.
- [x] Original writer stores immutable exact-byte receipt archive, clean fully active action ledger and v2 live-only checkpoint with durable CAS. Standby arming is upgraded before receipt persistence, so cold completed-action replay remains denied.
- [x] Original one-use last-user marker advances only to a new namespace. All old-root fingerprints, including detached requests, remain retired; same id/deadline survive two continuation cycles.
- [x] Stop before/during/after async work, exact pending-candidate commit/adoption CAS, stale Query after new await, native cold Session and Goal entry, generic admit and legacy reader rollback gates covered.
- [x] Trusted per-request/per-attempt transport cause is internal only. Auth/billing/policy, provider text claiming transport, parser errors, consumer cancel and RequestAbort cannot arm new or existing foreground stream continuation. Real socket/body idle and complete-prefix EOF remain supported; ping-only/half-frame translated EOF is unproven.
- [x] Local synthetic checks below passed; explicit feature paths are the handoff scope. Branch synchronization is verified by the separate project-sync handoff receipt, not by an embedded self-changing HEAD.
- [ ] Root independent review and actual-main integration (next step).
- [ ] Actual native/provider and original business-path acceptance after sole-publisher selection; intentionally outside this source-only task.

## Completed

Local diagnostic folder (not Git or memory): work/salary-recovery-20261020/settled-stream-continue-diagnostic/ in the root workspace.

- clean-baseline-red.jsonl reproduces exact 2158/e7: legal complete foreground with clean armed ledger, legal zero-tool background interruption, then a different fingerprint still409 and formal continuation refused. The earlier invalid message_start fixture is not used as green evidence.
- production-wire-negative.log + patch deliberately disable only the new native-result arm; the actual SDK-loop positive test fails at missing checkpoint. Source restored byte-for-byte afterward.
- stop-red/green.log: actual SessionStore writer commits waiting before arm adopts its returned value. Red falsely acknowledged Stop with waiting on disk. Fix only lets the original exact pending candidate be paused via its current CAS, preserving different successors. This does not retrospectively diagnose old business Stop incidents.
- owner-red.log: remove only the post-arm authority recheck; old result enters the actual terminal handler once (expected zero). Final native tests retain successor Query/Goal source and do not pause/finish/close/send input for it. Transparent observer is scoped to that test before module import.
- cause-red.log: real HTTP/handler/two-controller path accepted auth/billing/policy/provider-claimed transport SSE errors. Green covers their rejection, true socket/idle/raw EOF, translated valid-prefix EOF, and ping-only/half-frame EOF refusal; old foreground arm also refuses provider/protocol failures.
- rollback-reader.jsonl runs actual old 2158/e7 predicates: v1 supported, v2 rejected. New validator rejects missing-proof v2 and a v1 downgrade; pause/wait/rebind/CAS preserve v2.
- One full run was aborted because a newly introduced global vi.mock factory cached old turn singletons across resetModules. It was replaced by a test-local pre-import transparent spy; the old V1 case plus the entire native file then passed. Aborted fixture log is retained and is not reported as a pass.

## Verification

Final local verification: 22 unit files / 458 tests PASS; seven related integration files / 256 tests PASS (including entire 152-test builtin SDK-loop file). Full TypeScript, scoped ESLint on every changed/new TS path, test classification and diff check PASS. Synthetic SDK/loopback only: no real provider request/native child/App/production action, no CI/build/install/version operation. Exact commands and logs are in diagnostic README. Real writer tests use isolated temporary HOME.

## Blockers and unknowns

This cannot retroactively prove zero spill for old installed streams or clear historical unknown tools. Cold v2 recovery deliberately pauses: Session/Goal restore or another engine cannot reconstruct live permission from ledger/archive alone. Explicit subsequent business continuation follows existing product admission and completed/unknown action guards. First version conservatively requires terminal proof for every known task edge; ambiguous ambient edges can deny this path. A result arriving before background settlement is not retained. Terminal HTTP rejections and unproven/provider/protocol causes remain blocked. Exact action-hash protection is not a transaction guarantee for semantically changed external operations.

## Next step

Root independently reviews the fixed feature SHA and reruns its own cause/owner probes, then hands accepted changes to the existing sole publisher for actual-main integration and a later release batch. Do not modify the frozen prior batch or operate original sessions from this branch.


## CI fixture follow-up — 2026-10-21

Root reported PR178 / CI39521879223 failure in the old `session-transcript/stream-continuation.integration.test.ts` fixture. Exact clean feature HEAD `7f85cea3062aeb56d875485cae6e97d86a575dce` independently reproduced **four failures / four passes (eight expanded tests)**. The fixture manually composed Context and ModelFailover without the production handler's trusted interruption callback; it also supplied an orphan delta instead of a legal message prefix. The new fail-closed production policy correctly refused authority at native continuation marker advance. This is not evidence that the actual handler failed.

- [x] Replace only that test's manual controller composition with the actual `createBridgeHandler`, original token registry/config, and an ephemeral `127.0.0.1` HTTP Anthropic provider. Complete legal message/content frames end with genuine EOF on the interrupted response; healthy responses include the complete protocol terminal. No cause callback is synthesized or policy stubbed.
- [x] Preserve every original test/assertion for ordinary/Goal root/native owner, actual transcript durability, Stop, completion-commit failure, and a second independent task. Original eight pass through the real handler. Added upstream request counts prove the expected one request per admitted input.
- [x] Four additional actual-handler/native-result negatives cover permanent SSE error, incomplete frame, malformed SSE and downstream reader cancellation. Each terminates with error, one original input, one upstream request, and no waiting recovery checkpoint. All twelve tests pass.
- [x] TypeScript, scoped single-file ESLint, test classification and diff check pass. Only this integration fixture and this task record change; no production source, permission, timeout, version, configuration or installed state changes.
- [ ] Root independent **entire integration project (124 files)** run after this precise feature SHA, then existing publisher coordination. This follow-up executed the affected file only; earlier 256 integration / 458 unit results do not substitute for the new full-project gate. The CI failure remains recorded and cannot be called a CI pass until the deployment owner runs the next batch.

Evidence is retained outside Git at `work/salary-recovery-20261020/settled-stream-continue-diagnostic/ci-fixture-followup/`: `baseline-7f85-red.log`, `handler-final-green.log`, `typecheck.log`, `lint.log`, `classification.log`, `fixture.patch`, `original-assertions.json` and the final synchronized handoff receipt. Temporary HOME, synthetic SDK protocol and local HTTP provider only; no paid/real provider, App, original Session, shared CI or build operations. Next: root reviews the incremental SHA and runs all integration files, then sole publisher decides main/release admission.
