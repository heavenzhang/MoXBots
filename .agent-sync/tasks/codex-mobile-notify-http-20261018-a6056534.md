<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/mobile-notify-http-20261018 -->
<!-- git-project-sync-task:base=9269dd8c52c423a180bfba366c8f0434a90db005 -->
<!-- git-project-sync-task:status=in-progress -->
<!-- git-project-sync-task:scaffold=true -->

# Task: Add AuthStore-bound internal mobile notification HTTP adapter

## Objective

Add an internal, unmounted HTTP adapter that derives notification authority
from a live AuthStore bearer session and the exact DeviceStore-owned identity.
Support registration, revocation, and event-ID redemption only; no provider
delivery worker, public route wiring, or cold-start behavior.

## Acceptance criteria

- [x] Strict v1 bodies are capped at 8 KiB; request scope cannot be client supplied.
- [x] Register/revoke/redeem revalidate AuthStore plus exact current DeviceStore owner, binding, and generation.
- [x] Responses omit token and internal errors; redemption returns only a private pointer requiring subsequent target/session refresh and fresh approval.
- [x] Tests exercise real temporary AuthStore/DeviceStore/notification SQLite owners and synthetic verified subject/CSR.
- [x] Provider delivery, server route mounting, cold-start, and real-device push remain explicitly unimplemented separate gates.

## Completed

- Implemented `mobile_notification_http.rs`, exported the adapter type, added the
  notification core path dependency, and added canonical `EndpointId::parse`
  needed to revoke the returned opaque identifier.
- Updated notification core README to document the adapter's unmounted/local-
  test-only status and explicit delivery/cold-start limits.

## Verification

- `DEVELOPER_DIR=/Library/Developer/CommandLineTools cargo test --manifest-path services/agentnet/Cargo.toml mobile_notification_http::tests --offline --no-fail-fast` — PASS, 2 adapter tests.
- `DEVELOPER_DIR=/Library/Developer/CommandLineTools cargo test --manifest-path services/agentnet/mobile-notify-core/Cargo.toml endpoint_id_parser_accepts_only_canonical_uuid --offline` — PASS, 1 parser test.
- `DEVELOPER_DIR=/Library/Developer/CommandLineTools cargo clippy --manifest-path services/agentnet/Cargo.toml --all-targets --offline -- -D warnings` — PASS.
- `DEVELOPER_DIR=/Library/Developer/CommandLineTools rustfmt --edition 2024 services/agentnet/src/mobile_notification_http.rs services/agentnet/src/lib.rs services/agentnet/mobile-notify-core/src/lib.rs` — PASS; `git diff --check` — PASS.

## Blockers and unknowns

- Provider integration and service route mounting are intentionally absent.
- The adapter uses synchronous SQLite operations inside the AuthStore session gate, matching the existing service's short bounded identity operations.

## Next step

- Review exact diff, commit this task's files, and provide the commit SHA for
  root to cherry-pick and independently re-test.
