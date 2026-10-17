<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/mobile-notify-backend-20261018 -->
<!-- git-project-sync-task:base=9269dd8c52c423a180bfba366c8f0434a90db005 -->
<!-- git-project-sync-task:status=ready-for-review -->

# Task: Implement authenticated mobile notification source and provider delivery

## Objective

Add a default-disabled AgentNet mobile notification delivery feature. Preserve
AuthStore/DeviceStore ownership, persist endpoint session handles, and send only
event-ID-only hints via fixed APNs/FCM APIs. Keep Host source integration behind
a trusted internal interface until its owner supplies a verified binding.

## Acceptance criteria

- Existing service config remains off unless a valid explicit notification
  config is present; no public hint publisher accepts caller-asserted Agent/session.
- Endpoint candidates and claims are freshly checked against live auth sessions,
  exact current DeviceStore binding/generation, stored session handle, and claim lease.
- APNs HTTP/2/JWT and FCM HTTP v1/OAuth use fixed endpoints, bounded requests,
  no redirects, and generic event-ID-only payloads.
- Local tests exercise real temporary AuthStore/DeviceStore/notification stores
  and loopback provider success/failure/429/timeout; no production send.
- Docs state Host→hint source integration and real credential/device validation
  remain unverified.

## Completed

- Added an explicit opt-in service configuration, authenticated endpoint
  registration/revocation/redemption routes, and a bounded delivery worker.
- Bound registrations and claims to persisted AuthStore session handles and
  current DeviceStore authority; legacy unbound rows fail closed.
- Added fixed APNs HTTP/2/JWT and FCM HTTP v1/OAuth clients. Production URLs,
  request sizes, timeouts, response sizes, redirects, payload text, and exposed
  event data are bounded. Local loopback fixtures cover success, rejection,
  retryable status, timeout, and revoked-auth suppression.
- Made endpoint revocation retry idempotent only for the same exact current
  authority and stored session handle. Stale handles remain rejected.
- Documented configuration and the remaining Host→hint integration boundary in
  `services/agentnet/MOBILE-NOTIFICATIONS.md`.
- Cached APNs authentication JWTs for 45 minutes and shared the cache between
  sandbox/production clients; configured the provider HTTP client to require
  HTTP/2. APNs token validation now accepts any non-empty, even-length hex
  string within the existing 4 KiB endpoint bound.
- Added a runtime provider allowlist to registration. A provider lacking local
  credentials returns a fixed `503` with `Cache-Control: no-store` and creates
  no endpoint.
- FCM HTTP success is accepted only when the bounded JSON response has a
  `Message.name` for the configured project and a non-empty message ID;
  malformed, wrong-project, and unexpected-success responses remain unknown.
- Checked current source identity limits: AuthStore session issuance takes a
  caller-supplied device ID (`services/agentnet/src/store.rs`), so authenticated
  session + DeviceStore lookup alone does not prove device-key possession or
  Host role. The Host source remains unwired pending a fresh DeviceStore PoP
  challenge and Host-owner provenance; Agent/session references remain hints.

## Verification

- `cargo fmt --manifest-path services/agentnet/Cargo.toml --check` passed.
- `cargo test --manifest-path services/agentnet/mobile-notify-core/Cargo.toml`
  passed: 14 tests.
- `cargo test --manifest-path services/agentnet/Cargo.toml --lib` passed:
  163 passed, 5 ignored.
- `cargo clippy --manifest-path services/agentnet/Cargo.toml --all-targets --
  -D warnings` passed.
- Post-provider-fix full AgentNet service suite passed: 167 passed, 5 ignored.
- Post-fix focused provider suite passed: 6 tests, including APNs h2c fixture
  assertion, JWT cache reuse, token length bounds, and malformed/wrong-project
  FCM response handling. Focused unavailable-provider HTTP test also passed.
- The repeated DELETE HTTP regression passed within the full service suite; the
  core test also confirms stale session-handle rejection and current-handle
  retry success.
- Initial canonical base was `9269dd8c52c423a180bfba366c8f0434a90db005`; root
  dependency commit `1f8262cb1137391f315dbab0ba4a9b09e9720d61` was merged before
  implementation.

## Blockers and unknowns

- Host Bot/session ownership is not represented by NetworkService's PeerStore;
  the source entry point will remain crate-internal and require validated input.
- No provider credentials, internet sends, or physical-device checks are in scope.
- Official constraints referenced for this follow-up: [APNs request guidance](https://developer.apple.com/documentation/usernotifications/sending-notification-requests-to-apns), [APNs connection/token guidance](https://developer.apple.com/library/archive/documentation/NetworkingInternet/Conceptual/RemoteNotificationsPG/CommunicatingwithAPNs.html), and [FCM `projects.messages.send`](https://firebase.google.com/docs/reference/fcm/rest/v1/projects.messages/send).

## Next step

- Root integration owner to review and merge this branch, then run its
  integration checks. Host event source integration, provider credentials,
  device delivery, and production acceptance remain separate gates.
