<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/new-session-continuation-20261022 -->
<!-- git-project-sync-task:base=c8068493cfbfd32836c132ae63d5fbd227300b53 -->
<!-- git-project-sync-task:status=in-progress -->

# MOXBOTS-NEW-SESSION-CONTINUATION-20261022

## Objective

Fresh normal execution must not be labelled an unfinished task. Keep the existing exact-turn explicit continuation for stopped/interrupted original work.

## Acceptance criteria

- [x] A normal first running turn does not advertise a continuation.
- [x] Legacy running metadata and hydration/busy states show no banner or stale sidebar action.
- [x] Stopped/interrupted current-turn continuation remains explicit and once-only; cold crash recovery still becomes interrupted.
- [x] Session switching, completion, rejected admission, drafts/history and original dispatch guards remain intact.
- [x] Focused domain/DOM/integration checks and actual component browser checks; independent review.
- [ ] Commit/push/handoff to existing sole desktop CI/main/release owner, then verify remote main separately.

## Completed

Verified clean isolated worktree from exact remote main c8068493cfbfd32836c132ae63d5fbd227300b53. Source defect: deriveSessionContinuation includes running; banner only disables while busy. Existing server admission already rejects running. Screenshot/private business contents stay outside Git.

## Verification

RED: five new assertions failed against base (96 passed), retained in private evidence. GREEN: five files / 145 tests passed, covering shared projection, Banner, Sidebar, cold SessionStore recovery and continuation admission. Typecheck (including protocol/patch checks), targeted lint, classification, doc links and agent docs passed. WebKit real-component probe passed active/completed/hydrating/blocked/legacy-running negative states and stopped/interrupted positive states at1200/620; duplicate pending click, rejected retry, accepted hide and draft preservation passed. Independent source/UI review passed; themed fixture subsequently checked. Private evidence: WPS MoxBot/work/new-session-continuation-20261022/. Existing product design is the visual baseline; desktop/narrow desktop only. UI quality owner: primary with bounded independent reviewer after implementation.

## Deployment request

Required desktop-macos/updater unit. Sole CI/main/version/build/sign/install/publish/rollback owner remains 01a12bc2-907a-7702-b6dd-788225c5dfe4. Frozen 518.2 is unchanged; submit this repair for next unfrozen batch. No other unit or business replay authorized here.

## Blockers and unknowns

Code/local, real runtime and production acceptance remain separate. No native GUI handoff held. Screenshot runtime timing is not independently reconstructed from logs.

## Next step

Commit and push this tested branch, pass handoff, then send exact SHA and task record to the existing sole owner for CI/main/next unfrozen package. Native installed acceptance remains required after that package.
