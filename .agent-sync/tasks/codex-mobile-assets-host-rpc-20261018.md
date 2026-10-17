# MOXBOTS-MOBILE-002 Host asset RPC adapter

- Stable task: `MOXBOTS-MOBILE-002`, Host remote asset RPC extension.
- Objective: connect `session.assets.v1` to the existing Host owner and private native AssetStore without changing `session.remote/v1` or accepting caller-provided filesystem paths.
- Repository: `https://github.com/heavenzhang/MoXBots.git`.
- Branch: `codex/mobile-assets-host-rpc-20261018`.
- Base: `afdb2f0c04b22f6db3793132a046a84c6efadf60` (root task integration branch; intentionally not the current canonical `main`).
- Ownership: this branch owns `src-tauri/src/agent_network/remote_assets_target.rs`, `src/server/remote-session/assets.ts`, its focused tests, and the small approved helper visibility/module declaration changes. Root owns Cargo dependency wiring, actor dispatch, native store lifecycle, and internal resolver route.

## Acceptance

- Verify each operation against the authoritative desktop Agent owner before accessing the private store.
- Derive store scope only from the current account plus authenticated TLS peer/local device scopes.
- Resolve list entries only from the original SessionStore/overlay and registered tool-attachment owner; pass opaque owner cursors unchanged and preserve pagination.
- Read and upload bytes only through native private AssetStore APIs; all filesystem work runs in bounded blocking workers.
- Focused tests cover actual owner-derived paths and reject cross-session or arbitrary paths.
- Commit and push only this branch's files. Root integrates and owns full mobile RPC dispatch validation.

## Progress and evidence

- Implemented owner resolver in `assets.ts`: exact current SessionEngine session, visible SessionStore history, persisted enabled/visible Agent workspace association, message attachment reference parsing, trusted-root canonical path containment, external registry lookup, regular-file and 20 MiB bounds, opaque message-anchor pagination.
- Implemented Host adapter in `remote_assets_target.rs`: request and account lifetime gates; account/peer/local scope consistency; per-request Agent/session owner precheck; Store upload/read operations on `spawn_blocking`; original session owner list resolution, idempotent artifact registration, and preservation of owner cursor.
- Made only the approved `post/global/session` helpers `pub(super)` and declared the adapter module.
- Added focused owner resolver integration tests for an actual saved attachment, cross-session references, arbitrary caller paths, and workspace mismatch.
- Verification: focused Vitest integration test passed (2 tests); full TypeScript `tsc --noEmit`, focused ESLint, test classification, `rustfmt --check` for the new Rust module, and `git diff --check` passed. The test reused the pre-existing ignored Node dependency tree via a temporary symlink, removed after testing.
- Rust compilation was attempted after temporarily adding the confirmed `moxbots-asset-store` dependency locally, then removing that root-owned manifest/lockfile change. Compilation stopped inside platform dependency build scripts because the available Command Line Tools SDK lacks required system headers (`sys/types.h`, `stdio.h`, `zlib.h`); it did not reach this adapter's type checking. The temporary Cargo change and generated lockfile diff were removed.
- `project-sync task-init` was attempted with the confirmed repository/base and blocked because the pre-existing integration branch is dirty during work and diverges from the newly advanced canonical `main` (`b9857cff...`). This branch is intentionally based on the authorized root integration HEAD `afdb2f0c...`; do not rebase or merge canonical main here.

## Next step

Commit/push this feature branch and hand the exact SHA to root for integration. Root must run the integrated Cargo gate in its build-capable environment and adjust the host adapter if its actor/API integration reveals type mismatches. Incoming upload association to a SessionEngine send remains a separate future versioned method.
