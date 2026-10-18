# Host publication discovery independent review

Primary source: `/Users/zhangshaohua/Documents/Codex/2026-10-18/moxbots-host-onboard/src-tauri/src/agent_network/host_installer.rs`
SHA-256: `bfeaa26ead3686bdbeb59a5c8bd7ee87ad9f1b83207c0e285c94dde8a14aea57`
Harness captured current module bytes except the opening doc comment: True

No remaining P1/P2 findings in the reviewed latest source. One P2 was reported and fixed in source: publication discovery previously added the desktop's private CA while the advertised curl/bootstrap flow used the clean Ubuntu public/system trust store. fetch now uses ordinary trust only, without adding the per-connection private CA; registry calls the issuer-only interface. Private-CA-only targets must remain unavailable, and clean Ubuntu TLS acceptance is still needed.

Reviewed: exact serde schema and unavailable state, duplicate/unknown fields, platform/profile, source digest shape and release prefix, exact fixed paths, 16KiB streamed limit and immutable component sizes, HTTPS/no proxy/no redirects/no credential headers, pinned record issuer, before/after auth-generation/ready/principal/network checks, whole-record equality and actor pointer replacement fence; commands/mod/lib wiring.

Validation: project Rust 1.92.0, `CARGO_TARGET_DIR=/tmp/moxbots-host-installer-review-target cargo test --offline --manifest-path output/readonly-review/Cargo.toml`: 2 tests passed. Includes the source's publication test plus independent duplicate key, boolean/negative/zero types, encoded path, Unicode source, canonical issuer and shell command checks. Full fetch code type-checked against pinned reqwest 0.13.2, serde 1.0.228, serde_json 1.0.149 and url 2.5.8. Transitive dependencies were resolved offline in this isolated harness, so this is not the application's full Cargo.lock/Tauri/registry concurrency test.

Boundaries: no primary edits, services or production operations. Real Ubuntu trust, HTTP 404/redirect/chunk over-limit, and in-flight actor/account replacement integration remain primary acceptance work.
