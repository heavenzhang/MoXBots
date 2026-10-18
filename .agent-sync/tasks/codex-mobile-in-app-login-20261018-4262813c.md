<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/mobile-in-app-login-20261018 -->
<!-- git-project-sync-task:base=96010acb710dfa864ddad979fe1d0b6dc49df69a -->
<!-- git-project-sync-task:status=in-progress -->

# Task: MOXBOTS-MOBILE-002: repair real iPhone login and present account sign-in inside app

## Objective

Continue MOXBOTS-MOBILE-002: repair the observed physical iPhone login failure and present existing authentication inside the app. No new password authority, service deployment, account switch or credential export.

## Acceptance criteria

- [x] Verify canonical main and preserve prior candidate.
- [ ] Inside-app login, cancellation, expiry and return recoverable.
- [ ] Physical network failure diagnosed/rechecked.
- [ ] Focused checks, independent review, signed phone install.
- [ ] CI, commit and remote main delivery.
- [ ] Real SSO/session list accepted or precise remaining user step recorded.
- Server deployment: not applicable; internal phone installation authorized.

## Completed

- Previous candidate signed using existing account, installed and launched on real phone. Startup signed-out works; login click fails at discovery (connection category, 2 ms). Signing/install resolved; SSO not accepted.

## Verification

- project-sync observe/start/task-init pass at main96010acb. Current checks pending.

## Blockers and unknowns

- Service has PKCE/OIDC, no native password API. System auth sheet retains original owner. Network permission cause remains a hypothesis until physical retest.
- Full remote, speech, notifications acceptance remains separate.

## Next step

- Focused checks/review, build, sign and install without deleting data; exercise actual login/cancel.

## User correction: native password form and desktop logo

The system authentication sheet was built/signed/installed but did not meet the actual requirement; it is superseded, not accepted. The user explicitly requires a native username/password form, no browser handoff or separate management-console login. Phone app/launcher/startup assets must reuse the desktop blue MoXBots logo.

- [x] RN native form, transient password cleared on submission, both-platform foreground gates, original Rust PKCE/Ready/poll/session path.
- [x] Existing Dex confidential-client password adapter, default-off, random nonce/original signed-claim validation, closed errors, bounded concurrency/rates. No duplicate user/password store.
- [x] Canonical desktop brand file reused; opaque1024px launcher icon exported, Android adaptive/default artwork replaced.
- [x] SDK116pass/1ignored +strictClippy; mobile typecheck/lint +policy55pass; independent source/UI review.
- [x] Backend final targeted10pass and strictClippy; full-service first run192pass/1fail/7ignored (unchanged25ms notification fixture did not receive request before timeout), bounded4-thread final rerun193pass/0fail/7ignored; unchanged25ms case passes both focused and in full rerun. Original failure retained.
- [ ] Fresh native framework/app/prebuild/sign/install and actual input/keyboard/return acceptance.
- [ ] Actual existing Dex private config and original cloud owner deployment handoff/approval. Committed bootstrap does not enable password grant. No production writes or account/identity changes performed.
- [ ] Current CI, main delivery, real password sign-in/persistence/Host/voice/notification paths.

Scope dependency: existing cloud service deployment owner is01a12b99-7b38-78b1-831f-9c60257d386a. This task cannot independently deploy its code/config under the committed coordination policy. Ready change and exact release request will be recorded before seeking permission to coordinate that owner.

## Native password candidate acceptance update

- Primary inspected final backend10case names/results and strictClippy log; native SDK116pass/1ignored and strictClippy passed.
- Backend final full service193pass/7ignored with4threads; no ignored live tests counted as acceptance. Source review crossed root/client and worker/service ownership.
- Independent UI source/typecheck/policy55 checks passed, but tool render unavailable in worker; root owns actual physical form/keyboard checks.
- Both iOS Rust device/simulator Release frameworks rebuilt from clean b77d85f2f inputs, native source provenance retained in external build tree. Actual app prebuild/sign/install pending.
- Cloud handoff request: publish this normally reviewed/CI-accepted service code via existing scoped owner01a12b99; review actual Dex local account/MFA/consent policy, preserve all user IDs/client secrets/issuer and existing grants, enable only original confidential local-password path plus service native_password_login, take original private backup/locks and verify same-principal native password login/poll/cancel before acceptance. Never rerun bootstrap or copy provider credentials to app. No production changes have occurred in this task.
