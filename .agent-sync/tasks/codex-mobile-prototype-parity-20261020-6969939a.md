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
- [x] Complete presentation/navigation and focused tests, preserving812 native/reading behavior.
- [x] Final independent repair recheck and primary acceptance. Reviewer confirmed overlay repair and rendered UI; primary executed touch and keyboard checks in6sizes and inspected actual screenshots.
- [ ] Commit final combination, synchronize source and hand off to existing integration/mobile-unit owner.
- [ ] Mainline/shared CI/native artifact/physical acceptance by existing unit owner (not delegated here).

## Verification

- Combination: typecheck/lint PASS and77 policy tests PASS. History320/390/768 three pages90messages and Markdown/tool320/390/428/768 browser checks PASS. Navigation search/groups/info/continuation/draft/results/account/new-session plus actual covered-input/send touch and focus restoration PASS in6sizes (320/390/393/427/428/768).
- History original threshold was layout-dependent:320 anchorBefore251/after251/transcriptTop79, offset0→3977/content4213→8190. Replaced absolute distance<150 with actual before/after anchor delta<5 and post-poll<5; no claim of a repaired nonexistent scroll bug. Existing read/send/90-message assertions retained, root approved measurement correction.
- Independent reviewer found composer background still touchable while menu open; added covered input pointer guard and a dismiss surface below popover. Physical input/send coordinates must dismiss without editing/sending.
- Details and source-preservation matrix: `dev-docs/mobile-002/codex-conversation-parity-20261020.md`.
- Before changes: configured Git observe/start/task-init PASS. Node24 prototype and App npm ci PASS. First presentation stage: typecheck/lint and65 policy tests PASS; real Web QA search/empty/clear/open and initial conversation/tool screenshots inspected. Final combined regression and physical acceptance remain pending.

## Blockers and unknowns

- Existing Bots-network owner01a12b99 explicitly authorized local combination of its exact8128596d with this isolated branch after saving current changes. Its original session read/history/receipt/foreground guards, Markdown/ToolResult and safe media handling must be preserved. This is not shared CI/main/release/install delegation.
- The user's internal app real login/Host/ASR/push gates stay with that owner and are not closed by browser QA.

## Deployment request

- Required: mobile client unit, source presentation changes for iOS and Android. Existing mobile CI/build/install owner must confirm current unit mapping before target changes; no cloud/schema/protocol change intended.
- Handoff: this remote branch and task record; report the resulting head SHA outside this file.
- Evidence and dependencies: link tests, cross-unit compatibility/order, configuration/migrations, and rollback constraints.
- Status: source implemented; local UI acceptance passed; remote handoff pending; no shared CI/release/build/install triggered by this task.
- Owners: route each unit to its designated CI/deployment chat in the latest canonical plan; this task does not claim ownership.

## Next step

- Stage resolved merge paths, commit and normal-push the codex branch after verifying workflow path filters; run remote handoff gate and send exact SHA/evidence to existing owner01a12b99. No PR/sharedCI/build/install here. Mainline intake remains with the registered coordinator01a12bc2. Keep the reference unchanged and route formal CI/build/device acceptance through the unit owner.
