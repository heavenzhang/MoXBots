<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/mobile-assets-host-rpc-20261018 -->
<!-- git-project-sync-task:base=afdb2f0c04b22f6db3793132a046a84c6efadf60 -->
<!-- git-project-sync-task:status=in-progress -->

# MOXBOTS-MOBILE-002 Host asset RPC adapter

## Objective

Connect `session.assets.v1` to the existing Host owner and private native AssetStore without changing `session.remote/v1` or accepting caller-provided filesystem paths. Repository: `https://github.com/heavenzhang/MoXBots.git`. This branch is based on the root integration branch at `afdb2f0c04b22f6db3793132a046a84c6efadf60`, intentionally not the current canonical `main`. Root owns Cargo dependency wiring, actor dispatch, native store lifecycle and internal resolver route; this branch owns the target adapter, owner resolver, focused tests, and approved helper/module changes.

## Acceptance criteria

- [x] Verify each RPC against the authoritative desktop Agent/session owner before accessing the private store.
- [x] Derive Store scope from current account identity and authenticated TLS peer/local device scopes.
- [x] Resolve list entries only from original SessionStore/overlay and registered tool-attachment owner; forward owner cursor unchanged and preserve pagination.
- [x] Read/upload bytes only through native private AssetStore APIs, running filesystem work on blocking workers.
- [x] Add focused tests for valid owner-derived output and rejection of cross-session/arbitrary paths.
- [ ] Root integrates Cargo/actor/Store/route changes and runs the full Rust gate; incoming upload-to-SessionEngine association requires a future versioned method.
- [x] Commit and push only this branch's files for root integration.

## Completed

- Added `src/server/remote-session/assets.ts`: checks exact current SessionEngine session, visible SessionStore history, enabled/visible Agent and workspace association; resolves only attachment references in original assistant tool blocks; canonicalizes trusted-root paths, checks external registry entries, regular-file type and 20 MiB bounds; uses opaque owner message-anchor cursors.
- Added `src-tauri/src/agent_network/remote_assets_target.rs`: validates request/account lifetime and authenticated scope; prechecks Agent/session on every request; runs Store I/O in `spawn_blocking`; List resolves through the original session owner, registers outputs idempotently, and returns the owner cursor.
- Made approved `post/global/session` helpers `pub(super)` and declared the adapter module.
- Added focused integration tests for a real temporary attachment source, cross-session reference, arbitrary path rejection and workspace mismatch.

## Verification

- Node 24 focused Vitest: `src/server/remote-session/assets.integration.test.ts`, **2 passed**.
- Full `tsc --noEmit`, focused ESLint, test classification (399 server tests: 106 integration, 6 credentialed), `rustfmt --check` for the new adapter, and `git diff --check`: passed.
- `project-sync handoff` confirmed clean worktree and remote branch `codex/mobile-assets-host-rpc-20261018` at `b4ef604a2de81cba05b9767c65e896deba8a3a0b`; gate remains blocked by current canonical divergence and task record schema, which this update is intended to fix.
- Rust `cargo check --manifest-path src-tauri/Cargo.toml --lib` was attempted with a temporary local AssetStore dependency and then removed. Compilation stopped inside platform dependencies because available Command Line Tools SDK lacks system headers (`sys/types.h`, `stdio.h`, `zlib.h`), before the adapter was type-checked. No Cargo manifest or lockfile change is included.
- The focused test reused the already available ignored dependency tree through a temporary symlink; the link was removed after tests. No dependency installation occurred.

## Blockers and unknowns

- Current canonical `main` (`b9857cff181cdbd7139ce861443de88b43ff6a18`) diverged from the authorized root task base; do not rebase or merge it in this worker branch. Root will integrate into its current mobile task branch.
- Rust compilation needs a build-capable environment with an installed/accepted macOS SDK; root owns the full integrated Cargo check.
- Incoming attachment upload admission into an existing SessionEngine send is intentionally outside this RPC adapter because v1 has no association method; add it only through a new versioned protocol method.
- A dormant session without an owner dispatch fails closed with `TARGET_OWNER_UNAVAILABLE`.

## Next step

Root integrates this worker branch into the mobile task branch and runs the full Cargo gate in its build-capable environment.
