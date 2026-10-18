# iPhone in-app account login

Task: MOXBOTS-MOBILE-002. The first installed physical-iPhone login failed before reaching an account page (`OWNED_ACCOUNT_UNAVAILABLE`, discovery connection category, 2ms). Installation and process launch had succeeded; this is not a signing failure.

The iOS app now presents the existing provider page with `ASWebAuthenticationSession`. This is a system authentication sheet inside the app, not a new native password API. The service exposes PKCE start/callback/poll/cancel/session; credentials are entered only into the existing provider. The original Rust owner validates the authorization origin, owns the verifier, exchanges polling proof and persists the account in Keychain. JavaScript receives only the final closed account/error projection.

The provider's HTTPS callback must reach the service to complete code/nonce verification. It is not intercepted as an authentication-session completion URL. With no service change, the system sheet uses the supported nullable callback-scheme initializer and closes only after the original native poll confirms signed-in. See [Apple ASWebAuthenticationSession](https://developer.apple.com/documentation/authenticationservices/aswebauthenticationsession) and [RFC8252 section7](https://www.rfc-editor.org/rfc/rfc8252.html#section-7).

A credential-free, nonredirecting, ephemeral HEAD request to the configured public instance endpoint exercises the iOS system network path before raw sockets on first installation. This can expose per-app network access handling; it does not authenticate or replace the Rust descriptor/TLS checks. A network-permission cause is not claimed without physical evidence. No TLS bypass, HTTP login fallback or additional background mode is introduced.

The native sheet owns a bounded single-flight poll while the app is foregrounded; start and actual owner-queue dispatch also check foreground. Temporary transport failures retain the page until the original deadline. Before opening a delayed page, the deadline is checked again. Explicit cancellation fences late replies and calls the original logout. Only confirmed signed-out releases cancellation; failure preserves the original proof and the JS cancellation quarantine. Module destruction closes local presentation; remote cancellation is not guaranteed after process death.

## Verification

- Mobile TypeScript, focused ESLint and existing 55 policy cases passed.
- Swift core typechecks for real-device and simulator SDKs passed. The broader script reached unchanged Rust checks and was interrupted to bound local build concurrency; that Rust check is not reported as passed. CI owns the unchanged-Rust regression gate.
- Independent source review identified and closed foreground dispatch, transient poll, stale pause callback and pre-presentation expiry defects. No worker operated the user's phone.
- Full signed build, actual inside-app form, cancel/reopen/background checks and real SSO: pending physical retest.

Android authentication remains the existing external-browser flow in this iPhone-specific repair. No server deployment or new account authority. Full Host, voice and notification acceptance remains separate.
