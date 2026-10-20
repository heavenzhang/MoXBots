<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/memory-scan-scheduling-20261021 -->
<!-- git-project-sync-task:base=31af12eb99349171ae700d58e758e3b36f9eae00 -->
<!-- git-project-sync-task:status=ready-for-review -->

# Task: MOXBOTS-MEMORY-SCAN-SCHEDULING-20261021

## Objective

Move existing Memory Auto-Update candidate-history scanning off Tokio's async executor, so native management/Stop/UI work can be scheduled while large histories are read. Stable ID `MOXBOTS-MEMORY-SCAN-SCHEDULING-20261021`, parent `SALARY-RECOVERY-20261020`. Do not change candidate eligibility, Task/Session ownership, original Goal recovery, ledger, model routing or production state.

## Acceptance criteria

- [x] Actual `run_batch` on a single-worker runtime leaves concurrent health work responsive while scanning.
- [x] Keep workspace scan exclusive through blocking work, including dropped handler futures; release on completion/error.
- [x] A canceled Task cannot dispatch candidates after scanning. Scan failure does not release its Task execution claim or start a Session.
- [x] Preserve summary/config inputs and existing owner tests; local Rust type compilation and focused tests pass.
- [x] Commit only this task; root source review found no blocker. Independent replay/review, main integration/CI and native acceptance remain separate.

## Completed

- Isolated branch `codex/memory-scan-scheduling-20261021`; canonical origin `https://github.com/heavenzhang/MoXBots.git`.
- Initially requested base a487b5d353780fef4b624b42dd01d7d0ad4958d3; start correctly reported `stale_start_base` against later mobile-only main. Before code edits, root explicitly authorized non-destructive fast-forward to actual main31af12eb99349171ae700d58e758e3b36f9eae00; subsequent start/task-init PASS.
- No worker/external model delegated. Existing desktop publisher `01a12bc2-907a-7702-b6dd-788225c5dfe4` retains sole shared CI/build/release authority. This is local-only development/test/commit; no push, shared CI, App build/install/restart or original business Session operation.
- Existing read-only scan now receives owned workspace/config/summary snapshots on `spawn_blocking`. Its Arc workspace guard spans handler and scanner; the short membership mutex only protects insert/remove and never spans IO/await. Drop/panic cleanup releases this temporary guard, not Task execution authority. After scan await, the original exact task/queue is reauthorized before candidate lookup/admission.

## Verification

- Source diagnosis: installed5158 source2158daf6; native1second sample shows two Tokio async workers entirely inside synchronous `run_batch -> collect_candidates -> read_transcript`. This is a confirmed executor-blocking path; it is not established as the sole cause of live management API unavailability. Root TCP-only connection to61385 succeeded in2ms without HTTP.
- Regression first added to actual `run_batch`, with workspace-scoped test-only candidate scanner. Runs use temporary QA workspace, mock App and real in-memory scheduler claim; no real user history/provider or model calls.
- Cargo target is an APFS clone of this agent's prior local test cache, in this isolated worktree. Test-only ignored resource fixtures copied from the same earlier worktree; no publisher target/source modified. Initial compile correctly failed on missing bundle fixture before fixture copy; not a behavioral red result. Resource placeholders remain untracked/ignored and will not be staged (including `resources/cli/.ci-placeholder`).
- Rust1.92 real `cargo test --manifest-path src-tauri/Cargo.toml --lib memory_auto_update::tests --no-run` compiled the actual library/test binary. Local runtime needs Xcode's `usr/lib/swift-5.5/macosx` in child-only `DYLD_LIBRARY_PATH`; this is not a source/bundle modification. Initial missing Swift loader failure was not the behavioral red.
- Effective red: `memory-scan-red-behavior.log` — original synchronous actual handler,1 failed/1793 filtered,0.45s, exact assertion `the real run_batch blocked the only async worker during scanning`. The workspace passed the real path/rule-file handler gate and the scanner summary proved it ran.
- Green: same library test binary after repair, `memory_auto_update::tests` —31 passed/0 failed/1766 filtered,0.10s. Includes4 new actual-handler tests: single-worker health+duplicate exclusion+summary/config/claim; cancel during scan prevents admission; blocking scan panic reports failure and preserves claim; dropped async handler keeps exclusion until detached scanner ends and then releases it. Existing27 tests cover candidate eligibility, v2 history, dispatch cooldown, configure identity and Sidecar owner retention/release.
- `rustfmt --check --edition 2021 src-tauri/src/memory_auto_update.rs` and `git diff --check` PASS. Additional Clippy check started cold dependency checking, evidence `memory-scan-clippy.log`; optional and not a claimed PASS or delivery gate. Root confirmed actual library compilation31PASS is proportionate and requested immediate handoff. No TypeScript runtime/UI changes need TS checks.
- Already compiled test binary: `/Users/zhangshaohua/Documents/Codex/2026-10-21/moxbots-memory-scan-scheduling/src-tauri/target/debug/deps/app_lib-8dc454719f1c56aa`. Child-only loader directory: `/Applications/Xcode.app/Contents/Developer/Toolchains/XcodeDefault.xctoolchain/usr/lib/swift-5.5/macosx`. Filter `memory_auto_update::tests --nocapture`; root can independently run once without rebuilding.
- Evidence outside Git: root work/salary-recovery-20261020/memory-scan-{red-compile,red-behavior,green-compile,green-behavior,clippy}.log. No raw business data/credentials included.

## Blockers and unknowns

- Single-instance plugin synchronous accept, WebKit IPC response waits and overall live API failure are separate diagnosis/owner concerns; dependencies not modified here.
- Main/source and real native acceptance require root review and the existing sole publisher; a local test does not claim restored production API.

## Next step

- Root independently replay31 tests from the compiled binary and arrange the independent source review; then hand this exact local commit to sole desktop publisher for next batch integration. Remote push/main/CI/native acceptance are not executed by this developer.
