<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/upstream-transitions-20261025 -->
<!-- git-project-sync-task:base=848e333455c7045534bf51a951a19b6945c6aa1a -->
<!-- git-project-sync-task:status=ready-for-review -->

# Task: MB-UPSTREAM-FIXES-20261025: isolated sessions and renderer recovery

## Objective

Integrate selected upstream independent conversation and renderer/SSE recovery fixes while preserving MoXBots source-session ownership, existing recovery/ledger/Stop/update guards, cold-launch and update-draft behavior. Local implementation and commit only; root owns integration/mainline and desktop deployment coordination.

## Acceptance criteria

- Exact source owners and active background work survive failed or separate target birth; uncertain mutations are not replayed.
- Renderer replacement reattaches live identities; SSE reconnects recover through guarded snapshots without full historical stream replay.
- Existing cold launch, update draft, navigation and model management remain usable.
- Risk-relevant Node/DOM/integration tests and type/lint pass; required root dependency and native acceptance gates are explicit.

## Completed

- Eight upstream changes adapted incrementally; see `dev-docs/upstream-transitions-20261025/README.md` for coverage, deliberate IM exclusion and behavior matrix.
- Failed native Chat attachments retain their original reading Tab; new transition keeps the fork’s update-admission wrapper.
- No production writes, push, PR, shared CI, formal build, install, restart or release performed.

## Verification

- Unit/route/admin: 375 passing tests; extra unit + builtin/external synthetic integration: 813 passing (overlapping pools).
- TabProvider/Companion DOM: 147 passing; final CLI + App: 269 passing (172 CLI, 97 App).
- TypeScript passed with exact root helper dependency temporarily applied; affected ESLint passed. Dependency-cruiser: 0 errors, 18 unchanged-module no-orphans warnings.
- Rustfmt 1.92 parsed affected Rust modules; full Rust tests intentionally deferred to root integrated tree, keeping Cargo concurrency <=2.

## Blockers and unknowns

- This commit requires root helper `82bfef743a30b111f0b475ee643a89c9e897f584` in the integrated tree. Owner files are excluded from this worker commit.
- Native Rust compile, WebView replacement, real Provider/user paths and packaged/production acceptance remain unverified.
- Local only — not synchronized to remote, as explicitly scoped. Desktop deployment ownership is unchanged; no version allocated.

## Next step

Root reviews and integrates this branch with its helper and the other package commits, resolves the small shared lib.rs/test edits, then runs the listed Rust filters and final merged acceptance.
