<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/mobile-account-pages-main-20261018 -->
<!-- git-project-sync-task:base=400b746a4841bab8e4b99d8f83479fd54925c205 -->
<!-- git-project-sync-task:status=in-progress -->

# Task: MOXBOTS-MOBILE-002 account and settings routes

## Objective

Add native Expo Router account, profile, security, storage, about, and help screens to the reviewed mobile app. The session-list avatar is the sole account entry; routes preserve the mounted chat/session owner and draft state. All displayed account and attachment data comes from the existing native bridge. No native module, config plugin, notification preference, unsupported edit API, or fabricated success behavior is part of this task. Root integrates these owned UI commits.

## Acceptance criteria

- [x] Session-list account entry pushes the account menu; Expo Router preserves the root route, and focus refresh reuses its existing owner on return.
- [x] Profile displays only native account name, principal ID, and state; no editable fields or invented profile attributes.
- [x] Security refreshes native account status and routes home only after native confirms `signed-out`; root focus then clears account-scoped state.
- [x] Storage reads native attachment metadata and reports actual count/bytes; it provides read-only context and leaves upload/removal actions in the owning conversation.
- [x] About shows Expo app version and configured internal app name/build identifier; help provides static workflow guidance.
- [x] Account routes have accessible controls and loading/error/empty states; deferred logout tests cover confirmed, unconfirmed, and error responses.
- [x] Typecheck, lint, focused policy tests, Expo Router web export, and diff whitespace check pass.
- [x] Root-requested review repairs: route-focus request/commit fence, compact in-notice receipt query, account QA provenance banner, localized copy, disabled stale logout, correct topbar refresh semantics, and direct-link back fallback.
- [x] Confirmed logout dismisses to the already-mounted root; confirmation restores focus on cancel and traps keyboard Tab navigation in web.
- [ ] Root visual/native re-review and remote handoff after this focused polish commit.
- [ ] No native-device/logout, signed-build, production, or main-integration claim without corresponding evidence.

## Completed

- Started from verified canonical main `400b746a4841bab8e4b99d8f83479fd54925c205` with project-sync `observe`, `start --base`, and `task-init` PASS.
- Merged root's reviewed prerequisite integration `55771134560bb5aa00a2d4fe7e3cd2e5c4801f48` with a normal merge after task-init; no rewrite/reset.
- Committed owned implementation in `085781ac8c1b7d487ab79d3d54b52e5f0942c0c4`.
- Applied root's subsequent account UI review requests as a focused follow-up; the root remains responsible for integration and real native review.

## Verification

- `mobile/app`: `npm run typecheck` PASS; `npm run lint` PASS; `npm run test:policy` PASS (34 tests).
- `mobile/app`: `npx expo export --platform web --output-dir /tmp/moxbots-mobile-account-export` PASS; Router bundle includes account home plus profile/security/storage/about/help screens.
- `git diff --check` to be repeated after this follow-up commit.
- Consulted the Expo SDK v58 Router and Stack references for `useFocusEffect` and native-stack behavior: https://docs.expo.dev/versions/v58.0.0/sdk/router/ and https://docs.expo.dev/versions/v58.0.0/sdk/router/stack/.

## Blockers and unknowns

- Native logout, secure storage behavior, actual device storage contents, and native stack/back behavior require a custom native build/device path and are not inferred from web export or explicit QA fixtures.
- The browser was not available in this worker; account home and modal focus behavior need root's actual IAB/native review after integration.
- Root owns integration and native modules; this branch owns account route UI and tests only.

## Next step

- Root should integrate/review the branch, then verify the account entry/home, security logout confirmation with real native state, and in-chat unknown-receipt query in the current Expo QA app.

## Follow-up: session artifact screen

- [x] Add a separate Expo Router成果页 entry from the chat's temporary more menu; preserve the compact chat toolbar/composer.
- [x] Read/list native session artifacts with a 20-item cursor page, display native filename/MIME/size, and keep downloaded bytes and file URIs inside the native module.
- [x] Wire explicit download, progress, pause/resume, local preview/share, remove, and query-only recovery after ambiguous operations; do not automatically restart unknown downloads.
- [x] Restore each loaded page's local download states with at most 20 sequential, read-only `artifact.status` calls; new progress events take precedence, and loss of route focus prevents dispatch of subsequent checks.
- [x] Keep failed status checks visible with a manual check action; only confirmed `MOBILE_ARTIFACT_NOT_FOUND` enables a fresh download.
- [x] Add synthetic QA normal/error/early-event/pause-resume cases and make simulated preview/share copy explicit.
- [x] Raise artifact action touch targets to at least 44 px and distinguish information/success/error notices.
- [x] Root IAB reported successful artifact download → remove → redownload → ready path after tracker repair. Native preview/share on device remains unverified.
- [x] Pause/resume QA case now holds at 50% until explicit pause; explicit resume completes without a timer racing the user.
- [ ] Root re-review read-only status restoration, deterministic pause/resume fixture, 44 px touch targets, and post-blur dispatch stop after integrating the latest follow-up.

## Follow-up: return from artifacts to the originating chat

- [x] Keep a one-use in-memory navigation hint for the originating account principal, stable target identity, agent, and session; do not treat route parameters as authorization.
- [x] On root-route focus, verify signed-in account and fresh target catalog, resolve the current native-approved target ID by stable identity/agent, and fetch the exact session snapshot before restoring chat.
- [x] If the account, target, online state, or snapshot no longer matches, remain in the current sessions flow and require the user to reopen a verified session.
- [x] Add focused policy tests for stale account/target/session hints and for preserving the hint when a refresh is superseded by route blur.
- [ ] Root actual IAB re-review of chat → artifacts → return-to-originating-chat and fallback to sessions when the original session is no longer available.

## Follow-up verification

- `mobile/app`: `npm run typecheck` PASS; `npm run lint` PASS; `npm run test:policy` PASS (45 tests); `git diff --check` PASS.
- Docs checked against Expo SDK 58 Router and Stack references; behavior uses existing root-focus refresh and custom in-memory hint, not route parameters for authority.
- No native-device or post-integration IAB claim; root owns integration and actual route acceptance.

## Follow-up verification

- `mobile/app`: `npm run typecheck` PASS; `npm run lint` PASS; `npm run test:policy` PASS (43 tests).
- `mobile/app`: `npx expo export --platform web --output-dir /tmp/moxbots-mobile-artifacts-repair-web` PASS; native-device artifact preview/share and download behavior are not inferred from this web export.
- `git diff --check` to be repeated before the follow-up commit.
