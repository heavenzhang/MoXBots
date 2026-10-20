<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/watchdog-metadata-20261021 -->
<!-- git-project-sync-task:base=1edf2dd5b03bfed223cea33dd99bf66beb7be232 -->
<!-- git-project-sync-task:status=in-progress -->
<!-- git-project-sync-task:scaffold=false -->

# MOXBOTS-WATCHDOG-METADATA-20261021

Canonical repository: `https://github.com/heavenzhang/MoXBots.git` (`origin`).

## Scope and gates

- Fix watchdog inference-progress classification only in `src/server/utils/watchdog-auto-resume.ts` and its unit test. Do not modify `agent-session.ts`, Chat, bridge, Store, recovery-reconciliation or publisher integration files.
- Exact requested source is installed 515.6 commit `1edf2dd5b03bfed223cea33dd99bf66beb7be232`; worktree starts from that commit on `codex/watchdog-metadata-20261021`.
- At start, local `origin/main` and live `origin/main` both resolve to `4206eb2ef8f8bf2f9dc211b4f13842441dead0de`; pinned source is 11 commits ahead and 0 behind. The required installed-source exception is recorded; `stale_start_base` remains blocked and is not a mainline gate pass.
- No push, main mutation, shared CI, App build/install, configuration or production action is in scope.

## To Do

- [x] Confirm canonical remote, exact base, clean isolated worktree and current mainline refs.
- [x] Add regression cases for real SDK event payloads and bounded fake-time watchdog behavior; observe red failures on existing classifier.
- [x] Narrow progress renewal to real assistant output, nonempty stream deltas, completed tool results/task notifications and valid compact boundaries. Metadata/status/unknown/tool-progress heartbeat events do not renew.
- [x] Run focused unit tests, TypeScript check, changed-file lint, and diff check using the available Node 24 runtime.
- [ ] Commit the isolated change and report exact SHA for independent review. Do not push.

## Acceptance boundary

The test demonstrates that repeated compacting status, `commands_changed`, and tool-progress heartbeats cannot extend the 600-second inactivity budget, while actual output and completed results refresh it. This is a local policy regression test, not evidence of a production repair or full SDK/provider acceptance.
