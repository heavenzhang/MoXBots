<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/mobile-prototype-parity-20261020 -->
<!-- git-project-sync-task:base=4206eb2ef8f8bf2f9dc211b4f13842441dead0de -->
<!-- git-project-sync-task:status=in-progress -->

# Task: MOXBOTS-MOBILE-PARITY-20261020 align native mobile UX with approved prototype

## Objective

Bring the actual React Native mobile client close to the user-selected Codex mobile conversation experience; keep the approved V6 prototype as the functional reference. Preserve the native Rust/account/Host/Session owners and all existing security and receipt semantics. The prototype is the design reference, not a replacement production backend. Stable task ID predates the current continuation and remains MOXBOTS-MOBILE-PARITY-20261020.

## Acceptance criteria

- Session list, conversation, composer, new-session context, account routes, permission and artifact presentation use the prototype's hierarchy, spacing, controls and return paths.
- Keep the message viewport dominant: one compact header and a single resting composer; models/suggestions/connection details appear on demand.
- Search/filter and navigation have visible results, keep Bot/session identity and retain existing drafts. Unsupported real capabilities stay explicitly unavailable rather than simulated.
- Render and exercise real application QA views against the unchanged prototype at 393x852, 427x952 and 320px; independently review representative and completed journeys.
- App typecheck/lint and relevant policy checks pass; source/main delivery, local QA, physical device and provider acceptance remain separate.

## Completed

- [x] Verified user Git URL, clean source/base main4206eb2e and project-sync start/task-init gates; isolated worktree.
- [x] Located canonical prototype dev-docs/prototypes/moxbots-mobile-001; prior4387 service is absent, reference source preserved.
- [x] Captured unchanged reference and before/after App QA; official Codex mobile documentation read and independently compared the prototype/App source and screenshots.
- [x] Implemented session header, search, date groups and bound info sheet; compact conversation chrome, direct artifact entry, neutral reading layout and on-demand composer popover. First rendered App QA inspected; final behavior checks pending.
- [ ] Complete remaining presentation/navigation and focused tests.
- [ ] Independent UI review and primary recheck.
- [ ] Commit, synchronize source and hand off to existing integration/mobile-unit owner.

## Verification

- Before changes: configured Git observe/start/task-init PASS. Node24 prototype and App npm ci PASS. First presentation stage: typecheck/lint and65 policy tests PASS; real Web QA search/empty/clear/open and initial conversation/tool screenshots inspected. Final combined regression and physical acceptance remain pending.

## Blockers and unknowns

- Existing Bots-network owner01a12b99 explicitly authorized local combination of its exact8128596d with this isolated branch after saving current changes. Its original session read/history/receipt/foreground guards, Markdown/ToolResult and safe media handling must be preserved. This is not shared CI/main/release/install delegation.
- The user's internal app real login/Host/ASR/push gates stay with that owner and are not closed by browser QA.

## Deployment request

- Required: mobile client unit, source presentation changes for iOS and Android. Existing mobile CI/build/install owner must confirm current unit mapping before target changes; no cloud/schema/protocol change intended.
- Handoff: this remote branch and task record; report the resulting head SHA outside this file.
- Evidence and dependencies: link tests, cross-unit compatibility/order, configuration/migrations, and rollback constraints.
- Status: implementation in progress, not submitted; no shared CI/release/build/install triggered by this task.
- Owners: route each unit to its designated CI/deployment chat in the latest canonical plan; this task does not claim ownership.

## Next step

- Inspect rendered reference and application QA, record concrete deviations, then implement within coordinated source ownership. Keep the reference unchanged and route formal CI/build/device acceptance through the unit owner.
