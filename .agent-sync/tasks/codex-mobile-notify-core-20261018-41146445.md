<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/mobile-notify-core-20261018 -->
<!-- git-project-sync-task:base=400b746a4841bab8e4b99d8f83479fd54925c205 -->
<!-- git-project-sync-task:status=in-progress -->

# Task: Mobile notification core storage and strict event contracts

## Objective

Add an isolated AgentNet notification storage/contract crate for later authenticated service integration. It defines strict registration and Host hint v1 inputs, scoped endpoint/outbox persistence, dedupe, bounded delivery claims, and event-ID-only push envelopes. It does not add routes, provider networking, WSS messages, or mobile UI.

## Acceptance criteria

- Registration scope is derived by the service; provider tokens are redacted and bounded.
- Hint source dedupe is scoped to principal/network/device/binding/generation and rejects changed content.
- Provider payload contains only a server-generated event ID; redemption returns a private target/session pointer to the exact fresh endpoint.
- Endpoint, event, fanout, attempt, lease, and expiry bounds are enforced with private SQLite storage.
- Focused crate tests pass; no frozen reader closure files are modified.
- Same-installation token rotation remains under endpoint quotas and invalidates previous delivery claims.
- Host hint resolution distinguishes a bounded Agent ID from the Host device target.
- Global endpoint/event/delivery counts are capped and per-operation cleanup uses bounded batches.

## Completed

- Record committed results, not intentions.

- Added `services/agentnet/mobile-notify-core` with a strict contract, private SQLite endpoint/outbox, delivery lifecycle, dedupe, fresh-scope matching, revocation, quota/expiry handling, and 8 focused tests.
- Added README documenting the authority boundary and future AuthStore/DeviceStore/provider/HTTP integration gates.
- No route, production, provider credentials, mobile, WSS protocol, or frozen reader closure changes.
- Added stable installation UUID to registration v1; token rotations for the same authority/provider/installation reuse the endpoint, invalidate outstanding claims, and enforce quotas on token rebind paths.
- Added non-deserializable `TargetScope` derived from Host authority plus Agent ID (1–256 Unicode scalar values, no controls); target device and Agent ID now participate in the dedupe digest and private redemption pointer.
- Added global row caps (10,000 endpoints, 20,000 events, 100,000 deliveries) and bounded cleanup batches (250 event updates, 1,000 delivery deletes, 250 event deletes, 250 revoked endpoint deletes).
- Added quota-rebind, repeated token-rotation, Agent-target, global-cap, and bounded-cleanup regression tests (12 total).

## Verification

- Record commands and outcomes tied to the current branch.

- `DEVELOPER_DIR=/Library/Developer/CommandLineTools cargo fmt --manifest-path services/agentnet/mobile-notify-core/Cargo.toml` — passed.
- `DEVELOPER_DIR=/Library/Developer/CommandLineTools cargo test --manifest-path services/agentnet/mobile-notify-core/Cargo.toml` — passed, 8 unit tests and 0 doc tests; macOS host target only.
- `DEVELOPER_DIR=/Library/Developer/CommandLineTools cargo test --manifest-path services/agentnet/mobile-notify-core/Cargo.toml` after review fixes — passed, 12 unit tests and 0 doc tests.
- `DEVELOPER_DIR=/Library/Developer/CommandLineTools cargo clippy --manifest-path services/agentnet/mobile-notify-core/Cargo.toml --all-targets -- -D warnings` — passed.
- `DEVELOPER_DIR=/Library/Developer/CommandLineTools git diff --check` — passed.

## Blockers and unknowns

- Record unresolved ownership, environment, authorization, or validation gaps.

- This crate does not itself validate `AuthStore`, `DeviceStore`, Host connection epochs, source Session ownership, or current user authorization. A future service adapter must freshly validate these before constructing scope values and before provider send/redemption.
- No APNs/FCM credentials or provider integration; no native permission or real-device delivery validation.
- Provider tokens are stored in the private service SQLite file; no independent application-encryption key exists in the current service design.

## Next step

- Give the next agent one concrete starting action.

- Root integration owner: review the crate and add an authenticated owned-HTTP adapter only after defining the live AuthStore/DeviceStore/source Host checks; do not add a WSS control message or expose target/session data in provider payloads.
