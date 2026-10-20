<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/watchdog-recovery-closeout-20261020 -->
<!-- git-project-sync-task:base=4206eb2ef8f8bf2f9dc211b4f13842441dead0de -->
<!-- git-project-sync-task:status=in-progress -->
<!-- git-project-sync-task:scaffold=false -->

# MOXBOTS-RESUME-CLOSEOUT-20261020

## Objective

Fix confirmed watchdog recovery gaps affecting ordinary builtin Sessions, while retaining the existing Goal settlement, same-turn stream continuation, native history, action ledger, Stop/Pause and replay fences. Parent task SALARY-RECOVERY-20261020. Canonical repository https://github.com/heavenzhang/MoXBots.git, main. This branch is local only by explicit coordinator restriction; no push, PR, shared CI, build, installation, restart or publication.

## Acceptance criteria

- [x] Verify actual Git remote, main, base, clean isolated worktree and existing task records; observe/start PASS at base4206eb2.
- [x] Confirm current main includes GOAL-STALL8169f3b8 and STREAM-RESUME e9ba90839; read installed Info.plist0.5.14 separately.
- [x] Demonstrate the permanent per-session watchdog cap defect before fixing; permit a fresh budget only when a new business input crosses final SDK admission. Keep maintenance/recovery/retry caps.
- [x] Demonstrate durable pendingContinue survives Stop before fixing; revoke scheduled work synchronously and clear the persistent flag for user Stop and update Stop.
- [x] Demonstrate repeated compaction statuses prevent watchdog timeout before fixing; status remains visible but does not refresh progress or justify recovery.
- [x] Reproduce recursive reminder dispatch after Stop during persistence and stale timer clearing the Stop fence; reuse original guarded admission and check epoch/session at timer execution.
- [x] Expose the existing Stop control during compaction without changing execution owner, preserving drafts and already-stopping behavior.
- [x] Preserve Goal observer settlement and action replay/checkpoint semantics through focused regression.
- [x] Parent independent source review identified timer/recursive-admission boundaries; both now have failing-before/passing-after regression evidence. Latest renderer and final diff returned to parent for integration acceptance.
- [x] Local code, test, specification and continuity record prepared for exact local commit; remote integration remains parent-owned.
- [ ] Main integration/shared CI and desktop release/real-user recovery by original owners, outside this worker's authority.

## Completed

The old one-shot Set was never reset during the Session Sidecar lifetime. New business admission now renews it at the last SDK yield boundary; pure system reminders, memory/maintenance, owner-managed turns and retries cannot renew it. A remaining durable pending flag prevents renewal after uncertain cleanup. Existing recovery prompts cannot replenish their own retry budget.

Stop revokes the existing scheduled watchdog task with an epoch across teardown, metadata awaits and delayed launchers. The recursive enqueue path uses the original beforeUserPersistence/beforeDispatch/validateAtCommit gates to reject stale reminders even when Stop wins inside persistence. The persistent pendingContinue flag is cleared and must be acknowledged before Stop reports durable success. Old watchdog callbacks cannot abort a successor, clear the abort flag or schedule another reminder after Stop/reset. The same helper protects explicit update Stop.

SDK system/status (compacting/requesting/null) and init are not substantive progress. Coalesced result receipts remain filtered before progress. Real compact boundaries, assistant/stream and tool progress retain the existing timeout behavior. This bounds repeated status-only compaction without assigning the model warning as a root cause or increasing any timeout. SimpleChatInput exposes its existing onStop control during compacting, including restored loading projections; unknown system tasks retain their existing disabled behavior. Actual installed/native compaction Stop remains a release acceptance gate.

## Verification

Credential-free tests use an isolated temporary HOME and synthetic SDK iterator; no real provider or daily .moxbot state is touched. Node24 is the bundled /Applications/MoXBots.app/Contents/Resources/nodejs/bin/node. Ignored node_modules is a symlink to the existing goal-stall dependency tree; no dependency files changed.

Initial red evidence: /tmp/watchdog-closeout-red.log (new business cannot renew), /tmp/watchdog-stop-red.log (Stop leaves persistent pending flag), /tmp/watchdog-compact-red.log (22x30s compaction statuses suppress timeout). Additional red evidence: /tmp/watchdog-recursive-red.log (one stale synthetic SDK dispatch after Stop), /tmp/watchdog-timer-red.log (old launcher clears Stop fence), /tmp/watchdog-ui-red.log (compaction lacks Stop). Green targeted evidence: /tmp/watchdog-closeout-fences.log and /tmp/watchdog-closeout-ui.log. Final combined evidence: /tmp/watchdog-closeout-final.log; typecheck /tmp/watchdog-closeout-tsc-final.log; scoped lint /tmp/watchdog-closeout-lint-final.log. Do not commit private raw logs.

Reproduction command (run under bundled Node24): node node_modules/vitest/vitest.mjs run --project integration src/server/session-transcript/builtin.integration.test.ts src/server/builtin-session/model-recovery.integration.test.ts src/server/openai-bridge/context-recovery.integration.test.ts --project unit src/server/utils/watchdog-auto-resume.unit.test.ts src/server/builtin-session/model-recovery.unit.test.ts src/server/builtin-session/stream-continuation.unit.test.ts src/server/openai-bridge/model-recovery.unit.test.ts src/server/openai-bridge/context-recovery.unit.test.ts --project dom src/renderer/components/SimpleChatInput.send.test.tsx

Typecheck: node node_modules/typescript/bin/tsc --noEmit. Lint: node node_modules/eslint/bin/eslint.js src/server/agent-session.ts src/server/session-transcript/builtin.integration.test.ts src/server/utils/watchdog-auto-resume.ts src/server/utils/watchdog-auto-resume.unit.test.ts src/renderer/components/chat-input/SimpleChatInput.tsx src/renderer/components/SimpleChatInput.send.test.tsx. Classification: node scripts/check-test-classification.mjs. Final verification: 9 files / 380 tests passed, TypeScript passed, scoped ESLint passed (only existing baseline-browser-mapping age notice), test classification passed, git diff --check passed. Exact commit is reported outside this record.

## Blockers and unknowns

Installed0.5.14 is older than current source and these fixes. Source/isolated tests are not production acceptance. SDK unrecognized_model warning during compact is observed but its causal role is unproven; excluding status heartbeat from progress fixes the independently reproduced unbounded-wait path. Unknown side effects still require reconciliation and 409 remains authoritative. When old pending cleanup cannot be durably confirmed, the local cap deliberately remains spent, including for later business inputs, until storage is repaired and the original pending intent is resolved. This is a safety limitation, not unlimited automatic repair; a successful durable user/update Stop clears that pending flag through its original owner. No completed action is deliberately replayed or removed; no second execution/Goal owner is introduced. The legacy post-abort watchdog fallback is distinct from the original same-turn stream continuation and does not promise exactly-once external business operations.

## Deployment request

Unit desktop builtin client only. Existing sole CI/publisher01a12bc2-907a-7702-b6dd-788225c5dfe4 owns candidate selection, version, shared CI, build, signing, publication, installation and rollback. Parent lead owns integration/handoff. No Host/cloud deployment, new credentials, public listener, migration or release version assigned here. Parent receives this branch's exact local SHA and reviewable evidence; branch is not remote-synchronized until authorized parent integration.

## Next step

Parent review the local diff, then collect the exact local commit and integrate through existing owner-coordinated main/CI flow. Publisher selects a new candidate batch if the previous candidate was frozen; do not silently substitute this SHA into a frozen artifact. Verify installed version/source and the original Session/Goal business path separately after release.

## Independent review follow-up — durable Stop barrier

Parent independent review correctly rejected the initial8a65040 Stop acknowledgement: updateSessionMetadata's active-binding path returns an in-memory patch and schedules publication, so it did not prove disk pendingContinue was false. This correction is an additional commit;8a65040 remains unchanged.

- [x] Four active-binding regressions failed against8a65040: user/update Stop settled while original file.append was blocked, and both returned success when its commit failed.
- [x] Stop now waits for the existing active writer's bounded flush() barrier (its default2s, no timeout increase), then verifies the same writer and false flag. The writer's durable revision advances only after actual transcript sync and metadata/index publication, including file/directory sync.
- [x] Tests seed actual disk pendingContinue=true, block original append, confirm no premature Stop success and disk still true, release the barrier, then read sessions.json directly to verify false. These reads bypass the active metadata overlay.
- [x] Append failure returns MODEL_RECOVERY_STOP_NOT_DURABLE for both control paths. Repeated Stop also fails rather than treating its already-false overlay as proof. The original execution cancellation epoch stays revoked; update Stop cannot acknowledge safe exit. This does not claim durable success after a failed disk write or after a forced external process kill.
- [x] Risk-related verification:4files178tests passed; TypeScript, scoped ESLint and git diff --check passed. Exact additional commit is reported outside this file; no amendment, push or target change.

Evidence: /tmp/watchdog-durable-stop-red.log (all4new tests fail before fix), /tmp/watchdog-durable-stop-green.log (4pass incl repeated failures), /tmp/watchdog-durable-stop-final.log (risk regression), /tmp/watchdog-durable-stop-tsc.log and /tmp/watchdog-durable-stop-lint.log. This follow-up changes no UI, ledger, provider, Goal owner or writer implementation; prior380combined tests remain the initial commit's evidence, with only relevant server pools rerun here.
