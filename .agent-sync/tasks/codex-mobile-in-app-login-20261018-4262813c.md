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
