<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/remote-login-closure-1019 -->
<!-- git-project-sync-task:base=29a5394ffc2d43a7eaae27c60571dd1845c5ab83 -->
<!-- git-project-sync-task:status=in-progress -->
<!-- git-project-sync-task:scaffold=false -->

# Task: REMOTE-SESSION-1019-LOGIN desktop authorization closure

## Objective

Close the gap between browser authorization and the desktop's authenticated state. Restore the selected saved identity through its existing native owner, show terminal identity mismatch without masking it with further polls, and keep automatic completion as the normal path. Preserve all existing connections, credentials, active work and account isolation.

Repository: https://github.com/heavenzhang/MoXBots.git. Base main29a5394ffc2d43a7eaae27c60571dd1845c5ab83. Worktree: `/Users/zhangshaohua/Documents/Codex/2026-10-19/moxbots-remote-login-closure`.

## Acceptance criteria

- [x] Existing-connection login pins connection/principal/device/trust through native `owned_start_existing`, guarded by registry revision.
- [x] Remote discovery does not hold the registry mutation lock; recheck authority after startup and cancel only the newly created attempt if stale.
- [x] Account mismatch stops automatic/manual polling and remains visible until explicit cancellation. No account guard is relaxed.
- [x] Normal flow automatically checks completion. Manual checking remains inside collapsed advanced details.
- [x] Browser callback describes only completed web authorization and defers final login status to the client.
- [x] Focused tests, typecheck and scoped ESLint pass; deferred selection/cancel regression passes.
- [ ] Independent source and rendered UI review complete.
- [ ] Required CI and remote-main containment verified after normal PR merge.
- [ ] Exact signed desktop/cloud release and real browser-to-desktop-to-remote-session acceptance. These remain separately owned deployment gates.

## Completed

Implementation includes one registered Tauri command and a narrow renderer wrapper over the existing reauthentication owner. It preserves full account mismatch codes through translation, suppresses repeat polling after consumed identity rejection, and synchronously fences delayed selection when cancellation starts. The callback page no longer asserts desktop login success.

Independent reviewer `/root/login_review` (requested gpt-6-luna/medium, read-only) identified the mutation-lock and deferred-selection races; both were repaired with focused regression coverage. Primary owns integration. No external model called; usage/cost is not exposed.

## Verification

- Focused API/hook/dialog/account/selector tests:108/108 passed (5 files), including automatic completion, same-URL different-account pinning, stopped mismatch, cancellation and delayed selection.
- Full TypeScript `tsc --noEmit`: passed.
- Scoped ESLint: passed (existing baseline-browser-mapping advisory only).
- Rust native registry/command compilation, hanging TLS discovery regression and service callback regression: required CI pending. TLS test uses an isolated loopback handshake; no certificate bypass, real credential or server registration.
- Temporary real-component UI harness on127.0.0.1:5198 uses synthetic callbacks only. It cannot establish a production login result.

## Blockers and unknowns

Actual installed desktop remains unsigned-in. Existing public native CLI polling returned `OWNED_ACCOUNT_MISMATCH`; user reports browser username `admin`. This proves a different principal reached native validation, but does not establish whether the username differs from the saved identity or issuer/subject mapping changed. Do not silently switch, delete or rewrite accounts.

The original remote read error repair PR159 is merged in main29a5394f; that does not prove installed availability. Current installed app and active tasks are preserved. Daily app restart/replacement, cloud service writes and package publication remain with existing sole owners in `.agent-sync/plan.md`; this lane only queues the exact reviewed source for them. No messages to other chats are authorized by this task.

## Next step

Complete independent rendered UI review, submit the source PR and verify required CI. Merge current main normally, verify remote containment and queue exact source for the existing desktop/cloud release owners. After installation in an approved idle window, verify actual admin identity persistence, Ready and remote history/manual refresh before calling the incident resolved.
