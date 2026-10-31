# MOBILE-BOT-IMPLEMENT-20261101 · Implementation acceptance

The reviewed mobile V8 behavior is implemented in the real Expo58 app. Main PR218/b55634eb was merged before final verification, preserving its native draft binding, accepted-receipt cleanup, reconnecting recent list and bounded status recovery. No alternate execution/session authority was introduced.

## Delivered behavior

- Recent work first, spanning authorized Bots, with visible Bot/device and observed execution state; Bot filtering/profile/new conversation and artifact source return retain original ownership. No hardcoded production Bots.
- Continuous conversation uses the existing mobile or legacy send protocol. Processing/unknown receipt remains visible and is only queried; rejection restores the original into the current materialized conversation without replacing a newer edit.
- Approval is bound to original identity/session/generation/turn/request. A request remains single-flight across navigation. A received decision is distinct from later execution completion.
- Real immutable file descriptors and retained bytes survive later transcript changes and upload TTL. Same-name different content remains separate; full ID/hash/source are inspectable. “Continue editing” appends a reference after the existing original-session draft and never sends automatically.
- New work uses the explicitly filtered Bot or a Bot chooser. Home filter/scroll/view survive chat return. A Bot profile from chat selects that same Bot's conversations.

## Validation

| Layer | Result | Evidence |
|---|---|---|
| Mobile typecheck / Expo lint | PASS, no warnings | npm --prefix mobile/app run typecheck / lint |
| Mobile policy regression | 109 PASS, 0 fail/skip | npm --prefix mobile/app run test:policy; includes rejection restore scope/append/overflow and navigation-safe approval flight |
| Root TypeScript / test classification | PASS; 473 classified server tests | node node_modules/typescript/bin/tsc --noEmit; scripts/check-test-classification.mjs |
| Original artifact source resolver | 13 PASS | vitest --project integration assets.integration.test.ts; deleted source, subsequent files, hidden session, ownership and dangling symlink boundaries |
| Immutable AssetStore | 14 PASS | cargo test --manifest-path mobile/asset-store/Cargo.toml --locked --lib; real old/new bytes after deletion, seven-day cleanup, quota and cross-scope |
| Host network crate | PASS after main merge | cargo check --manifest-path src-tauri/headless-network/Cargo.toml --locked |
| Desktop full crate local check | Not completed: required signed CLIProxy resource missing in isolated checkout | build_cliproxy.rs requires resources/cliproxy/manifest-v1.json; no signature check bypass or fake resource supplied. Original CI owner must cover full desktop native check with the established signed resource staging. |
| Independent actual Expo UI | PASS after UI-01 repair; fixture only | review.md and review-*.png |
| Primary final UI | PASS 390×844 and 320×740, no horizontal overflow, no console errors | evidence/final-home-390.png and final-home-320.png; Bot/device label and account checked |
| Native phone, real Host/provider, preview/share, physical keyboard | UNVERIFIED in this development chat | Existing release owners' next candidate path; fixture evidence does not replace this. |

## Review repair

Independent review identified that first-message processing could materialize a session while a later rejection left the source draft under the null-session key. The definitive rejected receipt now restores text only to its matching original/materialized conversation after draft restoration; preserves a newer edit; refuses overflow; does not copy a processing/unknown message into the editable composer. The reviewer retested original text + later edit, processing→accepted, approval and disconnect recovery.

## Compatibility and release boundary

Older endpoints remain wire-compatible, but history retention requires the matching Desktop or Host changes in this task. Existing quotas are unchanged: capacity exhaustion rejects new captures rather than evicting delivered files. Only actually captured bytes can be retained; overwritten bytes never captured cannot be recovered. There is no server lineage/time metadata, so the UI does not invent V1/V2 ordering. The other chat's mascot work is still a design exploration and production targets have no shared character identifier; stable identity badges are used until one authoritative mapping is available.

No app.json version, release tag, installed app, original Host identity, production business data, shared CI or signed artifact was changed by this development chat. Main/CI and desktop delivery stay with 01a12bc2-907a-7702-b6dd-788225c5dfe4. Mobile/iOS/Android/dedicated Host delivery stays with 01a12b99-7b38-78b1-831f-9c60257d386a. Frozen build7 and desktop529.1 are unchanged; new source belongs to the next owner-selected candidate.

## Execution record

Primary agent owns integration/acceptance. Two bounded native workers: artifacts implementation and independent UI review, requested gpt-6.1-sol/high because cross-owner state, retained bytes and approval boundaries require careful review. No external model used. Worker costs/tokens and effective runtime model telemetry are not available; no estimated savings are presented as measurements. Independent review caught and verified a concrete rejection-path defect before push.
