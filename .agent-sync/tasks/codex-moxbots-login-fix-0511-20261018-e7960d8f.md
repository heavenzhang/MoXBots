<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/moxbots-login-fix-0511-20261018 -->
<!-- git-project-sync-task:base=f4e775f597803aca41e8816b88c711a7262e723d -->
<!-- git-project-sync-task:status=in-progress -->
<!-- git-project-sync-task:scaffold=false -->

# Task: MOXBOTS-LOGIN-FIX-0511-20261018

## Objective

Prepare the next MoXBots desktop patch from current main so browser-completed Owned login reliably resumes in the desktop. Preserve account/device identity and current tasks. The 0.5.10 tag is immutable and predates the fix. Track source/main delivery, package validation, production service compatibility, isolated native login QA, updater promotion, website download publication and Windows limitations as separate gates. Never claim public availability until the corresponding target is verified.

## Scope and current baseline

- Repository: `https://github.com/heavenzhang/MoXBots.git`; canonical branch `main`.
- Exact clean base at start: `f4e775f597803aca41e8816b88c711a7262e723d`.
- Stable task ID: `MOXBOTS-LOGIN-FIX-0511-20261018`.
- Working branch: `codex/moxbots-login-fix-0511-20261018`.
- Intended next patch version: 0.5.11, only after confirming repo versioning/build synchronization and immutable 0.5.10 records.
- Current report says that after completing website login the desktop cannot continue. Prior source diagnosis for the older client found valid login transactions rejected by a one-second clock difference (`OWNED_LOGIN_INVALID`). Current main includes the client skew fix (PR #118) and desktop callback wiring (PR #103); source existence alone does not establish production cloud compatibility or real desktop login acceptance.

## Acceptance criteria

- [ ] Confirm latest main ancestry and source deltas from immutable v0.5.10; do not alter or overwrite that tag/artifact.
- [ ] Verify the existing login skew, strict PKCE/session/origin checks, deep-link callback and ordinary polling fallback through focused tests; add a regression only if a current source gap is found.
- [ ] Use the existing version sync mechanism to prepare 0.5.11 consistently; verify all app/Tauri/Cargo metadata agree and release notes disclose included fixes and limits.
- [ ] Run focused login tests, relevant renderer/service regressions, typecheck/lint and full build/CI appropriate to the actual source change.
- [ ] Complete independent source/UI review and normal protected-branch PR/main delivery; verify remote main includes the reviewed head.
- [ ] Build the exact 0.5.11 candidate package(s), verify signatures/notarization, hashes and packaged source/version provenance.
- [ ] Real OIDC browser -> desktop callback -> original PKCE owner -> credential persistence -> resumed client use passes in a concrete isolated QA session, without touching active daily tasks.
- [ ] Cloud compatibility is deployed and verified by its existing service owner before claiming production login fixed. Reuse current account/device; do not add users, permissions or model calls.
- [ ] Promote updater stable and/or publish the website download only via the existing authorized release channels after all applicable gates, backup/rollback and package checks; verify the exact public bytes/manifest.
- [ ] If Windows is included, publish only the separately verified Windows build and disclose Authenticode/updater support; do not imply Windows runtime acceptance from CI.

## To Do

- [x] Observe clean worktree, exact Git remote, project map/plan and latest main; start from `f4e775f597803aca41e8816b88c711a7262e723d`.
- [x] Create branch-specific task record and isolate worktree.
- [x] Inspect exact PR #103/#118 implementation, current tests, 0.5.10 release artifacts and version sync contract.
- [x] Run current-main auth regressions and determine whether an additional source correction is needed.
- [x] Prepare version 0.5.11 consistently and record the candidate scope; no binary/public-site write yet.
- [ ] Obtain/reuse an isolated native QA entrance and run actual login-continuation acceptance.
- [ ] Coordinate cloud compatibility and unified package/update deployment owner; preserve existing identity and active work.
- [ ] Complete package, public distribution, rollback and client availability evidence, or document the exact owner/credential gate.

## Completed

- The candidate branch was created from the exact current remote main. The older 0.5.10 source tag is an ancestor of current main, so its bytes remain untouched.
- The earlier user choice is “做修复版（推荐）”; do not republish the unmodified 0.5.10 package.

## Verification

- `project-sync.mjs observe`: PASS on the configured user-supplied URL; original workspace clean and behind `origin/main` only because the new main SHA had just been fetched.
- `project-sync.mjs start`: PASS for this worktree at exact base `f4e775f597803aca41e8816b88c711a7262e723d`.
- `project-sync.mjs task-init`: PASS; task record path is this file.
- Exact `origin/main` base is `f4e775f597803aca41e8816b88c711a7262e723d`; it includes desktop callback wiring (PR #103) and bounded clock-skew handling (PR #118), while immutable `v0.5.10` predates PR #118.
- After PR #125 opened, `origin/main` advanced to `6fa9767bc8298a9a59be27cdef846abf572271d5` via PR #124. The intervening change only adds authentication-renewal handoff records; it was reviewed and merged into this candidate branch without conflicts. The desktop candidate remains based on current main, and the new candidate head still needs CI.
- `PATH="/opt/homebrew/opt/node@24/bin:$PATH" npm run test:dom -- src/renderer/features/agent-network/useOwnedLoginFlow.test.tsx`: 16 passed.
- `cargo test --locked --manifest-path services/agentnet/Cargo.toml login_start --no-fail-fast`: 2 passed.
- `node --test scripts/build-assets.test.mjs`: 9 passed; `bash -n build_macos.sh` and `git diff --check` passed.
- `DYLD_FALLBACK_LIBRARY_PATH="/Applications/Xcode.app/Contents/Developer/Toolchains/XcodeDefault.xctoolchain/usr/lib/swift-5.5/macosx" cargo test --locked --manifest-path src-tauri/Cargo.toml --lib agent_network::owned_login::tests --no-fail-fast`: 8 passed. macOS emitted duplicate Swift Objective-C class warnings from the Xcode/system runtime combination; no login test failed.
- `PATH="/opt/homebrew/opt/node@24/bin:$PATH" npm run typecheck`: passed. `PATH="/opt/homebrew/opt/node@24/bin:$PATH" npm run lint`: exit 0, with 18 existing dependency-cruiser warnings and no ESLint errors.
- `PATH="/opt/homebrew/opt/node@24/bin:$PATH" npm run build:assets`: passed; Vite, server, plugin bridge and CLI bundles completed; theme preset regression 8/8.
- Targeted Prettier check for the new release note and this task record passed. Full-repository `npm run format:check` returned nonzero because it reports many unchanged files across the repository; no broad formatting changes were made.
- Version source of truth is `package.json`; `scripts/sync-version.js` synchronized both Tauri configs and both Cargo manifests to 0.5.11. Offline Cargo updates set the `myagents` and `myagents-document-worker` package versions in their separate lockfiles to 0.5.11. A metadata verifier confirmed all eight package/config/lock version fields match.
- macOS runtime preparation is complete for arm64: Node v24.20.0, DSH v0.1.18 with the manifest-pinned archive SHA, TSX, Sharp, CLIProxy, app bundles and the exact Claude SDK dependency are staged in ignored checkout-local resources. `npm run build:assets` generated server, bridge and CLI assets.

## Blockers and unknowns

- No concrete independent macOS QA user/VM/session entry has been provided yet. Do not launch a package with the daily app's shared bundle/single-instance identity.
- Website upload route is absent in the earlier 0.5.10 handoff; user said no SSH Host alias is configured. Recheck the repository's approved website publisher route, but never reuse updater signing identity for website writes.
- PR #118 includes the desktop clock-skew fix; PR #103 adds desktop callback routing. Production cloud compatibility/deployment and real OIDC/desktop acceptance are not established by merged source.
- The app may already be running tasks. Do not quit, replace, restart or install on the daily client without a fresh explicit idle/backup window and exact candidate review.
- 0.5.11 source version metadata and candidate notes are prepared, but there is no signed candidate package or public release yet.

## Next step

Commit this task-record synchronization, push the updated PR #125 branch, then verify the new head's required CI and merge it through the normal PR flow. Separately verify the existing updater signing input and use the MoxBots-specific build entry, not the generic MyAgents script. Obtain a concrete isolated QA entry before launching any signed app with the shared bundle identity.

## 2026-10-18 native/package progress (supersedes earlier blockers)

PR #125 merged; exact build source `15be9d6fda17c464afa54ee675d10f1d7fd4507f`. Existing protected updater key was located and reused; no VM or missing signing-key blocker remains. User authorized current-Mac maintenance with normal stopping of the two named waiting turns. Consistent backups and real production-profile browser/desktop continuation, original identity, baseline cold restart and authenticated read passed; independent current native UI/package acceptance passed within explicit limits. Signed/notarized archive and current immutable stage details live in `dev-docs/releases/moxbots-0.5.11.md`. External full normal-TLS download is still in progress; stable not promoted. Final delivery branch task is `.agent-sync/tasks/codex-release-0511-delivery-20261018-29f55182.md`. Do not treat earlier “candidate never launched/no signing input/VM needed” statements as current facts. Daily on-disk app remains0.5.9; no updater A-to-B installation or remote model acceptance inferred.
