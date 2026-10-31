<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/mobile-bot-experience-20261101 -->
<!-- git-project-sync-task:base=b55634ebd763120fb9236a35ae9ba6fb96cd9f00 -->
<!-- git-project-sync-task:status=in-progress -->

# Task: MOBILE-BOT-IMPLEMENT-20261101

## Objective

Implement the approved V8 mobile Bot/conversation interaction in the actual Expo app and push it for mainline delivery. The user's latest instruction supersedes prototype-only scope. Keep existing execution, account, receipt and approval authorities; keep desktop/mobile Bot identity concepts consistent.

## Acceptance criteria

- [x] Recent work across authorized Bots is the entry point; Bot identity, profile, task context and explicit new-work ownership remain visible.
- [x] Reuse mainline reconnecting recent-session reader and message receipt journal. Merge PR218 main b55634eb; preserve its draft binding, automatic reconciliation, offline ownership and account identity behavior.
- [x] Approval refresh is single-flight, exact generation/turn/request checked; receipt acceptance does not claim task completion.
- [x] Original Bot/session artifact return restores and appends to existing drafts, never auto-sends. Same-name different content remains separate immutable descriptors.
- [x] Desktop/Host output history reads exact account/scope/session store after original owner authorization; session-bound output survives temporary-upload TTL, deleted source does not erase captured bytes.
- [x] Mobile typecheck/lint and 109 policy tests; root typecheck/classification; 13 JS source integration tests and 14 real AssetStore tests pass.
- [x] Primary and independent final fixture UI acceptance at 390/320; rejection-path defect repaired and retested.
- [ ] Desktop full check via original CI signed-resource path (local isolated checkout lacks required manifest).
- [ ] Exact source pushed; original shared CI/main owner integrates through required CI and actual remote main is verified.
- [ ] Mobile/Host owner chooses a new immutable release candidate; original desktop owner separately chooses its next batch. Real native device and endpoint path acceptance is separate.

## Completed

Isolated source worktree `/Users/zhangshaohua/Documents/Codex/2026-11-01/moxbots-mobile-bot-experience`. Initial product commit d00a17b74; merge current main via 7bf8f0aca. Mainline `DraftPersistence` and its full tests are retained exactly, superseding the initial duplicate draft token implementation. `useBotDirectory` only adds read-only snapshot status to the existing recent reader, bounded to 12 most recent sessions and 3 reads in flight. Every row carries target identity + agent + session; opening revalidates against the current catalog. Bot profiles use real directory fields, with no invented workspace/config values.

## Verification

Details and evidence: `dev-docs/mobile-bot-experience/plan.md`, `artifacts.md`, `review.md`, and `evidence/`. Local fixture app uses explicit synthetic-data banner; Expo58 actual source, fresh app-local node_modules, 390x844 and 320x740 review. Fixture UI cannot certify native download/share, real login, provider execution or physical device installation. Source tests use real temporary bytes for history/TTL/permissions, with owner metadata/visibility fixtures; no real business operation is replayed.

## Blockers and unknowns

Final UI passed after UI-01 repair. Desktop full local crate check requires the original signed CLIProxy bundle; no signature or build guard was bypassed. Real mobile/Host/Desktop integration and release pending original owners. Artifact IDs/hash describe actual captured contents, not invented chronological V1/V2 lineage; files overwritten before their first capture cannot be reconstructed. Existing storage quota is unchanged; full storage rejects new captures without evicting old deliverables. Avatar design in the other chat is still prototype-only and the production target protocol has no shared character ID, so this version uses stable Bot identity badges rather than guessing a mascot from a name. No native version/build/tag is allocated here.

## Next step

Commit final source/evidence, push exact source, and submit one main/CI request to owner 01a12bc2-907a-7702-b6dd-788225c5dfe4. Mobile iOS/Android and dedicated Host deployment owner remains 01a12b99-7b38-78b1-831f-9c60257d386a; desktop/macOS/updater owner remains 01a12bc2. The frozen build7 and desktop529.1 candidates are unchanged. UI works with older endpoints, but retained artifact history requires the matching new Desktop or Host source. No shared CI, signing, public endpoint, version switch or production operation was run by this development chat.
