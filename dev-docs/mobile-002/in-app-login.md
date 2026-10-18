# Native account login on iPhone and Android

Task MOXBOTS-MOBILE-002. The installed iPhone signed and launched successfully, but the first account discovery failed (`OWNED_ACCOUNT_UNAVAILABLE`, connection category, 2ms). The attempted system authentication sheet did not meet the user requirement and is superseded by an ordinary native account/password form. It is not accepted as completed login.

The form uses the same MoXBots account as desktop. It never opens a browser or asks the user to enter the management console. It clears the password UI state on submission; passwords are transient in JavaScript/native memory and neither logged, persisted nor automatically retried. Session credentials, PKCE verifier and device identity remain in the original Rust/OS secure-store owner. The original protocol is extended only with the closed `account.login.password` intent. It validates fields, starts a server-verified Ready transaction, then consumes it through the existing proof-bound poll. An uncertain result does not replay the password.

`POST /auth/login/password` is an optional, default-off adapter to the original confidential Dex client and local password connector. It validates signed provider claims with a random nonce and retains the original issuer/sub to principal mapping, network and TTL. Provider secrets/tokens never enter the mobile app. Rate/concurrency limits and strict request/response bounds apply. See [service contract](../mobile-003-native-password-service.md). Running service configuration and deployment are independent required gates; no production capability is inferred from local tests. Existing browser login for other clients is preserved.

The iPhone additionally performs a bounded, credential-free, nonredirecting ephemeral HEAD to the configured instance endpoint using system networking. This gives iOS the opportunity to handle per-app network access before the Rust socket request, without relaxing TLS or creating a second identity authority. The cause of the original connection failure remains unconfirmed until actual phone retest. Password submission is gated again on actual foreground dispatch on both platforms.

## Desktop brand reuse

`mobile/app/assets/moxbots-mark.png`, Android adaptive foreground/monochrome and splash assets reuse the exact canonical `src/renderer/assets/brand/moxbots-icon.png`. The 1024px iOS icon is a deterministic resize/composite of that original mark on opaque white, with no shape redraw or generated alternative. Expo's generic artwork is no longer configured. The native login page uses the same mark. Native generated icon catalogs, installed launcher appearance and splash rendering require a fresh prebuild/package/reinstall.

## Acceptance status

- Before this change: development signing, real device installation, bundle/version readback and process launch passed. Real login failed and is retained as evidence.
- Native password source implementation: in progress; focused SDK/service tests and independent UI review underway.
- Previous policy55/typecheck/lint checks do not prove the new password flow. Current results recorded in task receipt after completion.
- Physical form, password verification, account persistence, Host session, voice and background notifications: not yet accepted.
- Server publication follows the existing scoped cloud deployment owner; this mobile task has not changed production or the user's daily desktop.
