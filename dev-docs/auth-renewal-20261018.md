# MOXBOTS-AUTH-RENEWAL-20261018

## Scope and acceptance

Fix owned desktop login and deliver safe unattended account renewal/reconnect for the existing Host at 101.42.11.29. Preserve its device identity, private key, principal, network and configuration. Do not install, update, restart or operate the daily Mac client. Source, isolated tests, remote main, production deployment and authenticated Bots Ready acceptance are separate gates.

The login change is owned by this task. `MOXBOTS-HOST-ONBOARD-001` owns the single renewal implementation in AuthStore, network HTTP and the headless connector; this task reviews that implementation and independently checks 101. Releases remain serialized through the existing unified deployment owner. Neither implementation task may take a competing production window.

## Login diagnosis

Read-only diagnosis found the installed Mac client is 0.5.9. Its log records `owned login start failed code=OWNED_LOGIN_INVALID` on 2026-10-18. This happens before the returned browser authorization URL can be opened. Notification Center `SPACE_LOCAL_ERROR` messages are a different path and are not evidence of this failure.

The client accepts a start deadline only when `now < expiresAt <= now + 300`. Six isolated legacy `/auth/login/start` requests to the actual HTTPS service reproduced a valid server transaction with a 300-second lifetime measured against its HTTP Date, but a 301-second difference measured against the local clock. That one-second clock difference is enough to reject an otherwise valid response. All six temporary transactions were canceled with their original PKCE proof and returned 204. No real account was logged in, no device was enrolled and no token was copied from the daily client.

The fix tolerates at most 30 seconds of future clock skew and clamps the locally accepted deadline to `now + 300`. Expired responses, larger skew, overflow, unexpected schema, unsafe URL, incorrect status and missing no-store remain failures. This does not extend the server's transaction lifetime or weaken PKCE, device or origin checks.

A service-side compatibility change also caps the actual pending transaction and its advertised deadline at 270 seconds, without enlarging shorter configured lifetimes. This leaves the older installed client 30 seconds of clock margin within its existing 300-second check. It does not alter account session TTL or require updating the daily Mac. The cloud change must ship through the same serialized service deployment as renewal; until then the installed-client failure is not claimed fixed in production.

Redacted private evidence is in the project pointer's `output/auth-renewal-20261018/login-start-redacted.json` and `legacy-start-sampling.json`. These files contain status/clock/validation results only, not authorization URLs, proofs or tokens.

## Renewal security decisions

The existing 24-hour session on 101 has already expired. A device key alone cannot recreate an expired account authorization. Migration requires one formal authorization using the original identity; subsequent renewal must act only on a live, unrevoked session.

Review rejected indefinite extension of a fixed account bearer. Community, feedback, admin and other account endpoints accept that bearer without device PoP, so a leaked copy would receive the same extended lifetime. The single renewal implementation must rotate the opaque bearer inside the original AuthStore session owner, keeping the session handle and management binding stable. Old bearer validation must fail after rotation.

The client must persist a renewal candidate in its original encrypted owner before submitting it. A lost response or crash must be resolved against the server's actual candidate session and original identity, without reviving expired/revoked rights or overwriting a later login/logout. Revocation races, stale snapshots, two renewers and failed persistence need explicit tests. Reconnect must use the original device/key and must not replay business writes or expand finite Bot/model grants.

The existing descriptor and login poll response are strict contracts; renewal must not add fields to them. The login module's proposed `inspect_session(device, token)` reads the existing `/auth/session` response under the original transport and validation gates. Existing `validate_session` continues rejecting any principal, network or expiry mismatch with its immutable snapshot. A confirmed 401 from the exact authenticated GET is mapped to an invalid saved session only after no-store and bounded JSON validation. Network failures and 5xx remain distinguishable; treating them as an invalid token would incorrectly drive recovery. Independent review found this missing 401 contract and the added real-wire regression closes it.

## Verification and delivery

- [x] Actual HTTPS start/clock reproduction and cancellation; sanitized evidence saved.
- [x] Read-only 101 status: original network connector expired; Host process active. No production writes.
- [x] Existing Host script suites: network-install 30, network-control-daemon 6 and unified-install 11 passed (47 total).
- [x] Renderer login/callback/cancel/account isolation: useOwnedLoginFlow 16 and OwnedAccountEntry 22 passed (38 total). These use the test renderer, not the daily Mac.
- [x] Login/session-inspection module: 7 tests passed, including real-wire 401, retryable 503, closed connection, 301-second start, strict schema and immutable expiry. The primary reran this module independently.
- [x] Complete headless connector suite: 183 passed, 0 failed.
- [x] Service login/start compatibility and PKCE/device/cancel tests: 2 passed.
- [x] Full service suite: 159 passed, 0 failed, 5 manual browser fixtures ignored by their original test configuration.
- [x] Headless clippy redlines passed. A pre-existing argument-count warning was then removed using four closed request profiles with unchanged limits; all 183 headless tests passed again and independent source review confirmed equivalent behavior.
- [x] Final headless and service clippy `--all-targets -- -D warnings` passed.
- [x] Login exact-head625 CI (Test39087732715 / Owned39087732694), all seven checks; PR118 normally merged into remote main e87654fbdf050157b2f50b620fe7e0f69e7cd6cc.
- [x] Independent source review of the login/API and service compatibility change passed after repairing the 401 contract; the separate renewal source was subsequently accepted by primary and independent review at8cdeac561.
- [x] Single renewal source8cdeac561, primary and independent security review, real-key positive recovery plus three foreign-scope rejection cases; Host191/service166 with5 existing ignored, strict all-targets Clippy. PR119 final CI/main and actual101 acceptance remain separate.
- [ ] Remote main integration with exact-head required CI and ancestry/tree verification.
- [ ] Unified owner deployment with fresh backup/rollback, identity preservation, actual renewal, disconnect/restart recovery and Bots Ready verification.

These pending gates are not acceptance claims. Main delivery does not update the installed daily Mac client.

## Main receipt and joint continuation (2026-10-18)

PR118 merged normally with exact head62515eaa39df1763a77141670afa2c8899f4f8c6 after all seven checks succeeded. Remote main e87654fbdf050157b2f50b620fe7e0f69e7cd6cc has parents b6c6d352/62515eaa and tree bae916c5be1142ed0d08725150db4d1c702af216, identical to the independently verified merge preview. Node24 combined Auth/Goal/Todo DOM116 and full typecheck passed; the concurrent Goal UI did not change auth/Host/service Rust.

The authentication task remains in-progress. PR119 must deliver the combined renewal source through its own gates. The unified deployment owner then schedules the compatible cloud plus original101 connector maintenance separately from the frozen desktop/Windows/public-installer batch. Preserve original identity/Node/configuration/finite grants, use one formal same-account authorization for the expired session, and independently verify actual login, Bots Ready, renewal/reconnect/restart and later natural24-hour observation. No production or daily Mac action is implied by this source receipt.
