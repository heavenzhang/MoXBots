# MB-UPSTREAM-FIXES-20261025 · Session transitions / renderer recovery

## Scope and ownership

- Task branch: `codex/upstream-transitions-20261025`; base `848e333455c7045534bf51a951a19b6945c6aa1a`.
- Repository: https://github.com/heavenzhang/MoXBots.git; upstream reference: https://github.com/hAcKlyc/MyAgents.git.
- This worker owns local implementation, synthetic tests and commit only. The root integration owner merges packages and owns final acceptance. No push, PR, shared CI, production build, install, process restart or real-account operation was performed.
- Desktop is the affected deployment unit; its existing designated deployment session remains unchanged. No release version allocated.
- `src/server/agent-session.ts` and `src/server/builtin-session/lifecycle.ts` remain root-owned; the required dependency is root commit `82bfef743a30b111f0b475ee643a89c9e897f584`. Its exact changes were temporarily applied for local verification and removed before this worker commit.

## To Do List

- [x] Verify isolated worktree, branch, base, fetch/push URL; run git-project-sync start/task-init with explicit remote.
- [x] Read CLAUDE, architecture, Session/Transcript and IM owner boundaries.
- [x] Integrate the eight selected upstream commits incrementally; preserve fork recovery, execution ledger, Stop/update and task/admission guards.
- [x] Validate CLI, renderer state, snapshots, SessionEngine, builtin/external synthetic integration; TypeScript and affected ESLint.
- [x] Preserve native parser validity with Rust 1.92 rustfmt on affected modules; avoid shared compile contention.
- [ ] Root: integrate the packages and root helper, run full product Rust compile/tests and final merged checks.
- [ ] Root/desktop owner: native WebView replacement and real-provider acceptance when authorized by the overall task scope.

## Coverage and deliberate choices

| Group | Upstream commit | Included behavior / limits |
| --- | --- | --- |
| 3 | `2c4c4bfa601051bfdbb922c8154dcb4159a03d7e` | Native renderer attachment precedes Tab mount; replace only old Tab transports; enumerate exact old owners; separate pending recovery offers from live layout. CLI shares advertised model-add options, preserves dry-run control flags and admits config-unset preview. |
| 3 | `e29774fd7bef5844cfed46f53f0fd85df984d59e` | Stream attach captures revision/live row without projecting/replaying full historical transcripts; REST snapshot handles reconnects with existing generation fences; cancellable capped retries continue. Private commands reuse the already admitted native/Bridge boundary. |
| 2 | `230d813ba8be86cd7d4a35fc37f67cb6efc3ca54` | Rust controls desktop new-conversation decisions, exact owners and channel binding; Runtime validates expected source inside its serialized mutation. Acknowledgement follows target publication; uncertain writers retire only after real process exit. |
| 2 | `2a5909c03a66c71b2c545662840f976ff3eae1e1` | Retained/shared/busy sources permit separate birth; target is prepared before source detach. Explicit pre-reset refusals preserve the original writer. |
| 2 | `4d45cc6c37d4c7e971e3234d30cb0916078d6e85` | Separate conversation clears transcript-local projection; pending materialization and same-session reconnect preserve state. |
| 2 | `de3f2b67cc64d570ecdb655928143d10d6c143cb` | Current-generation endpoint lookup and read-only source-loss handling. Excluded `im/commands.rs` offline permission editing because that patch depends on the upstream access-policy module outside this package; no blacklist/access subsystem imported. |
| 2 | `e4f28f7588cdbb93551f40ca54ccf8652e452f19` | Source recovery/peer/router/projection locks do not block separate birth. Ready target publishes before asynchronous exact old-Tab release, preserving recovery under BackgroundCompletion. |
| 2 | `440417b6400fe2cdbf1e1e09d963542614315284` | Adapter obtains serialized mutation through the root-owned agent-session facade; test mock uses the same lifecycle instance. |

### Fork behavior preserved

| Scenario | Result |
| --- | --- |
| Normal cold launch | Fresh launcher; no historical-page recovery prompt or automatic historical restore. |
| Explicit update draft handoff | Existing draft validation/restore path, no automatic send; checkpoint lock retains the handoff. |
| Native renderer replacement | Reattach persisted live layout using the same Tab/Session identities. Existing model-QA and zoom bootstrap remain intact. |
| Unaccepted/overflow recovery | Persist separately. Only replacement renderer exposes a compact remaining-pages recovery action; it appears after old-token retirement completes. Existing sidebar/navigation is unchanged. |
| Failed native attachment | Keep the same reading Tab and source owner; retry through its existing startup-error action. Do not remove the failed Tab as upstream did. |
| Separate pending conversation | Prepare unique target and reconcile its owner before changing current Tab; failed target preparation retains source attachment. Clear stale history only for a separate conversation. |
| Stop/update transaction | New transition remains wrapped by the fork selector’s `withUpdateAdmission`; freeze still rejects mutation. Existing ledger, budget, Goal and background work logic is retained. |

No external IM context injection, cards, blacklist policy, Runtime upgrade or vendor dependency update is included.

## Verification

Runtime: `/opt/homebrew/opt/node@24/bin/node`; read-only dependency symlink to the already provisioned integration node_modules. All fixtures use temporary storage and fake Runtime/SDK or loopback HTTP; no real Provider inference or application-state mutation.

| Check | Result |
| --- | --- |
| Unit routes/admin/SSE/SessionEngine/transition | 6 files, 375 tests passed. |
| Additional CLI/persistence/restore/SSE/SessionEngine + builtin/external integration | 8 files, 813 tests passed; includes builtin transcript 167 and external fake Runtime 241. Repeated overlapping tests are not additive. |
| TabProvider activity/title + Companion | 3 files, 147 tests passed. |
| Final CLI + App behavior regressions | 2 files, 269 tests passed (CLI 172, App 97). Covers missing model flag values preserving dry-run; advertised options; cold boot/update; independent target failure; delayed source-owner release; pending recovery fences; failed native reading Tab retry. |
| TypeScript | `tsc --noEmit` passed with root helper temporarily applied. |
| Affected ESLint | Passed, zero lint violations; the installed browser compatibility database reports its age. |
| Dependency boundaries | No errors; 18 no-orphans warnings on unchanged modules. No suppression added. |
| Git whitespace / conflict markers | Passed. |
| Rust syntax | Affected modules parsed by pinned Rust 1.92 rustfmt; full product compile deferred to root’s integrated dependencies. |

Initial DOM failures exposed a missing toast hook and upstream cold-launch/failed-Tab expectations inconsistent with this fork. The implementation and explicit fork behavior regressions now pass; no failed tests are hidden or skipped. A transient merge separator in handover was removed before rustfmt parsing.

## Root integration and remaining gates

1. Include root commit `82bfef743a30b111f0b475ee643a89c9e897f584`: `runSerializedSessionMutation` facade export and `getBuiltinLiveSessionSnapshot(targetSessionId, { includeHistory: false })`. This worker intentionally does not commit those owner files.
2. Merge the small lib.rs registration changes with the native worker: `mod main_renderer`, `MainRendererState`, `cmd_attach_main_renderer`, replace old surface-migration command registration with `cmd_new_desktop_session`.
3. Preserve this package’s selector update-freeze wrapper when integrating other packages’ shared adapter/test edits. No package.json or shared specification changes made by this worker.
4. Product Rust test filters after all package dependencies are paired: `main_renderer::tests`, `sse_proxy::tests`, `im::handover::tests`, `im::agent_channel::tests::private_chat_and_commands_preserve_platform_admission`, `sidecar::session_lifecycle::session_lifecycle_tests`, `sidecar::manager`, `keyed_lifecycle`. Use pinned Rust 1.92 and `CARGO_BUILD_JOBS=2`; apply the native worker’s fixture/cache environment if required. These tests were not executed in this worktree.
5. This establishes source and synthetic behavior only. Native WebView reload, real accounts/permissions, real Provider replies, packaged desktop/Linux Host behavior, mainline and production acceptance remain separate root-owned gates.

## Integrated Rust compile follow-up

Root’s first combined Rust compile identified two missing cross-module prerequisites: `session_has_exact_owner` was still `pub(super)`, and Router’s surface migration still accepted only three arguments. The failure log belongs to root evidence at `dev-docs/upstream-fixes-20261025/evidence/combined-rust-compile.log` in the integration worktree.

The narrow prerequisite from upstream `3c16fc83edca103742dc6004707f4a62948e800e` is now included:

- Expose only the existing read-only exact-owner query at crate scope. This does not expose mutation or bypass lifecycle admission.
- Add `channel_sidecar_port` to Router migration. Project the Manager-proven port, including zero for a dormant Channel lease, instead of inheriting a stale Router endpoint. The handover caller retains its exact Agent-owner check.
- Preserve the fork’s strict Tab + Agent owner migration gate. A dormant or shared source can still take the existing separate-birth path; no broader owner admission was imported.
- Add port-cache/lease combinations `(0,0)`, `(32001,0)`, `(0,32002)`, `(32001,32002)` with exact rollback checks, and a migrated attached-lease idle-collection test that retains the Tab and target binding. Existing stale-binding refusal test is updated to the explicit port contract.

Verification of this follow-up: pinned Rust 1.92 rustfmt parsed both changed modules without file-wide formatting; `git diff --check` passed. No Cargo was run while root owns the shared native target. Root must rerun combined compilation and `im::router::tests::surface_`, `im::handover::tests`, plus the lifecycle tests already listed above before declaring native validation passed.
