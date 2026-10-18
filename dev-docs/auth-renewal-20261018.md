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

The existing descriptor and login poll response are strict contracts; renewal must not add fields to them. The login module's proposed `inspect_session(device, token)` reads the existing `/auth/session` response under the original transport and validation gates. Existing `validate_session` must continue rejecting any principal, network or expiry mismatch with its immutable snapshot.

## Verification and delivery

- [x] Actual HTTPS start/clock reproduction and cancellation; sanitized evidence saved.
- [x] Read-only 101 status: original network connector expired; Host process active. No production writes.
- [x] Existing Host script suites: network-install 30, network-control-daemon 6 and unified-install 11 passed (47 total).
- [x] Renderer login/callback/cancel/account isolation: useOwnedLoginFlow 16 and OwnedAccountEntry 22 passed (38 total). These use the test renderer, not the daily Mac.
- [ ] Login, legacy service compatibility and session-inspection regression tests and full headless/service suites.
- [ ] Single renewal implementation, independent security review and combined tests.
- [ ] Remote main integration with exact-head required CI and ancestry/tree verification.
- [ ] Unified owner deployment with fresh backup/rollback, identity preservation, actual renewal, disconnect/restart recovery and Bots Ready verification.

These pending gates are not acceptance claims. Main delivery does not update the installed daily Mac client.
