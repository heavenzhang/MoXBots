# Host publication discovery independent review

Primary source: `/Users/zhangshaohua/Documents/Codex/2026-10-18/moxbots-host-onboard/src-tauri/src/agent_network/host_installer.rs`
SHA-256: `bfeaa26ead3686bdbeb59a5c8bd7ee87ad9f1b83207c0e285c94dde8a14aea57`
Harness captured current module bytes except the opening doc comment: True

No remaining P1/P2 findings in the reviewed latest source. One P2 was reported and fixed in source: publication discovery previously added the desktop's private CA while the advertised curl/bootstrap flow used the clean Ubuntu public/system trust store. fetch now uses ordinary trust only, without adding the per-connection private CA; registry calls the issuer-only interface. Private-CA-only targets must remain unavailable, and clean Ubuntu TLS acceptance is still needed.

Reviewed: exact serde schema and unavailable state, duplicate/unknown fields, platform/profile, source digest shape and release prefix, exact fixed paths, 16KiB streamed limit and immutable component sizes, HTTPS/no proxy/no redirects/no credential headers, pinned record issuer, before/after auth-generation/ready/principal/network checks, whole-record equality and actor pointer replacement fence; commands/mod/lib wiring.

Validation (corrected): project Rust 1.92.0 and actual desktop crate edition 2021, `CARGO_TARGET_DIR=/tmp/moxbots-host-installer-review-target cargo test --offline --manifest-path output/readonly-review/Cargo.toml`: 2 tests passed. Includes the source's publication test plus independent duplicate key, boolean/negative/zero types, encoded path, Unicode source, canonical issuer and shell command checks. Full fetch code type-checked against pinned reqwest 0.13.2, serde 1.0.228, serde_json 1.0.149 and url 2.5.8. Transitive dependencies were resolved offline in this isolated harness, so this is not the application's full Cargo.lock/Tauri/registry concurrency test.

Boundaries: no primary edits, services or production operations. Real Ubuntu trust, HTTP 404/redirect/chunk over-limit, and in-flight actor/account replacement integration remain primary acceptance work.

## Edition correction after CI feedback

The initial harness used edition 2024 without checking the desktop crate edition 2021. That review therefore missed the let-chain syntax rejection later caught by CI; the initial compile result did not establish compatibility with the application edition. Root replaced the construct with a plain match. No primary source was edited by this reviewer.

Captured current source SHA-256: `2c237cc9c6aec2978c81e04a8043fcdcf10a5f206fdbf82c7a5e7640ddfd8b88`. The same harness and same two tests were rebuilt with `edition="2021"` using cached dependencies and Rust 1.92.0. Exit code 0; 2 passed, 0 failed.

## Final TLS owner and origin alignment review

Current source SHA-256: `315e109ca994fa521b01b2a2f8b787ec31d3fe8415a2ac29fbf9139803dc9e48`. Captured source still equals primary except the opening doc comment.

The new DNS/IPv4-only origin gate matches the Python bootstrap and excludes IPv6, trailing-dot and underscore origins before command discovery. The external HTTPS construction has the per-call Clippy allowance explicitly required by src-tauri/clippy.toml, uses the established crypto::external_tls_config() owner (TLS 1.3, platform verifier, no client auth, no early data), disables redirects/proxy/retries, and supplies no private CA. No new P1/P2 finding or API-boundary issue was identified.

Rebuilt the same two tests under Rust 1.92.0 / edition 2021 using the actual repository `src-tauri/agent-network-crypto` path dependency. Only From<CryptoError> is stubbed to the harness error type; TLS config is real. The independent test also constructs a reqwest client with the real TLS config and retry::never() without making any request. Exit 0; 2 passed, 0 failed. Full Tauri/Clippy/platform integration remains the primary combined CI boundary. No primary or production edits.
