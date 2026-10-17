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
- [ ] Root visual/native review. Owned source and this task record are not yet committed/pushed.
- [ ] No native-device/logout, signed-build, production, or main-integration claim without corresponding evidence.

## Completed

- Started from verified canonical main `400b746a4841bab8e4b99d8f83479fd54925c205` with project-sync `observe`, `start --base`, and `task-init` PASS.
- Merged root's reviewed prerequisite integration `55771134560bb5aa00a2d4fe7e3cd2e5c4801f48` with a normal merge after task-init; no rewrite/reset.

## Verification

- `mobile/app`: `npm run typecheck` PASS; `npm run lint` PASS; `npm run test:policy` PASS (31 tests).
- `mobile/app`: `npm exec expo -- export --platform web --output-dir /tmp/moxbots-account-pages-web-export-2` PASS; Router bundle includes account home plus profile/security/storage/about/help screens.
- `git diff --check` PASS after the receipt-query adjustment.
- Consulted the Expo SDK v58 Router and Stack references for `useFocusEffect` and native-stack behavior: https://docs.expo.dev/versions/v58.0.0/sdk/router/ and https://docs.expo.dev/versions/v58.0.0/sdk/router/stack/.

## Blockers and unknowns

- Native logout, KeyStore data behavior, actual device storage contents, and native stack/back behavior require a custom native build/device path and are not inferred from web export or explicit QA fixtures.
- Root independently requested a compact in-chat query control for a pending unknown receipt; it was added to the same app index route using existing protocol-aware `queryPending`, but awaits root review.
- Root owns integration and native modules; this branch owns account route UI and tests only.

## Next step

- Root should integrate/review the branch, then verify the account entry/home, security logout confirmation with real native state, and in-chat unknown-receipt query in the current Expo QA app.
