<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/mobile-notify-backend-20261018 -->
<!-- git-project-sync-task:base=9269dd8c52c423a180bfba366c8f0434a90db005 -->
<!-- git-project-sync-task:status=ready-for-handoff -->

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

## Verification

- `cargo fmt --manifest-path services/agentnet/Cargo.toml --check` passed.
- `cargo test --manifest-path services/agentnet/mobile-notify-core/Cargo.toml`
  passed: 14 tests.
- `cargo test --manifest-path services/agentnet/Cargo.toml --lib` passed:
  163 passed, 5 ignored.
- `cargo clippy --manifest-path services/agentnet/Cargo.toml --all-targets --
  -D warnings` passed.
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

## Next step

- Root integration owner to review and merge this branch, then run its
  integration checks. Host event source integration, provider credentials,
  device delivery, and production acceptance remain separate gates.
