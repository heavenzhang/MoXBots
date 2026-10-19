<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/session-cache-002-20261019 -->
<!-- git-project-sync-task:base=8e60805e8c19073ba09ac33389a0994482c5c225 -->
<!-- git-project-sync-task:status=in-progress -->

# Task: SESSION-CACHE-002 缓存会话即时显示与历史优先恢复

## Objective

SESSION-CACHE-002: cached Chat navigation retains its mounted projection; uncached persisted sessions read display history before restoring the execution connection. Preserve SessionStore, Rust exact-owner, and REST/SSE generation authority. No runtime/config/credential migration.

## Acceptance criteria

- [x] Identify source, branch, installed version and original cache/restore failure path.
- [x] Cached A→B→A preserves Chat instance/history/draft/scroll and performs no startup/history reload for a healthy cached session.
- [x] Cold history is readable while Session Sidecar/SSE are delayed or fail; connection retry preserves that history and draft.
- [x] Preview cannot authorize sends, adopt revisions/interactive state, overwrite a newer live snapshot or leak across session/unmount boundaries.
- [x] Focused DOM/unit tests, typecheck/lint, web build, rendered browser interaction and independent review.
- [ ] Commit, CI, merge current main, push and verify remote ancestry.
- [ ] Signed native release and real-user acceptance: queued to existing sole desktop release owner, separately tracked.

## Completed

- Source base main 8e60805e8c19073ba09ac33389a0994482c5c225, clean isolated branch codex/session-cache-002-20261019.
- Installed /Applications/MoXBots.app reports 0.5.11. Local .moxbot logs show healthy Sidecar reuse while history still waits behind connection.
- App warm jump unconditionally invokes startup materialization and failure replaces cached Chat with launcher. TabProvider initial history waits for SSE or an 8s fallback to the same Session Sidecar.

## Verification

Evidence: `dev-docs/session-cache/acceptance.md`; 236 merged DOM + 41 unit tests, merged typecheck, focused zero-warning lint, build and actual App synthetic-transport UI passed. Primary implementation/UI acceptance owner: /root; independent read-only lifecycle/diff reviewer: /root/cache_review (requested gpt-6.1-sol medium for cross-module owner/revision race checks). No external-model calls; tightly coupled implementation remains single writer. Model/token monetary usage unavailable.

## Blockers and unknowns

- Daily client must not be restarted/interrupted by this source task. Sole desktop release owner remains the committed deployment chat; no concurrent signing/publishing.
- Browser/DOM evidence is synthetic; does not establish signed-native user-path acceptance.

## Next step

Complete PR #147 CI, integrate current main and verify remote ancestry; then the existing sole release owner takes the queued native candidate and real-user acceptance. Native release is not completed by source/main delivery.

## Deployment request

Required: next unfrozen desktop release, existing sole owner `01a12bc2-907a-7702-b6dd-788225c5dfe4`. Include this branch via PR #147 plus integrated main. No migration/config/credential changes. Preserve daily tasks and existing rollback procedure; test the exact signed artifact on cached A/B navigation, cold history before connection, failed recovery/retry, native-birth sessions and explicit continuation. Source/UI fixtures passed; signed native and real-user-path acceptance remain pending. No message to another chat was sent.
