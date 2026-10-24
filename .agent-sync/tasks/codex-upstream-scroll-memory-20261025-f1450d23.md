<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/upstream-scroll-memory-20261025 -->
<!-- git-project-sync-task:base=848e333455c7045534bf51a951a19b6945c6aa1a -->
<!-- git-project-sync-task:status=in-progress -->

# Task: MB-UPSTREAM-FIXES-20261025 scroll positioning and custom memory compatibility

## Objective

Port scroll ownership/fractional geometry and custom memory compatibility fixes into the MoXBots worktree while preserving current navigation, model management, and recovery architecture. Do not touch real workspace memory or business data.

## Acceptance criteria

- [x] Scroll ownership, cancellation, fractional geometry, and targeted renderer tests pass.
- [x] Synthetic custom-memory discovery tests pass across Rust/script filename rules.
- [x] Rust/TypeScript system-skill snapshot version is raised to 62 so installed v61 copies receive changed bundled memory skills; this is not an App version allocation.
- [x] Rust cross-language memory filename parity regression is added against the shared JSON fixture.
- [ ] Rust tests pass after the parent releases Cargo capacity.
- [x] Changes and verification evidence are recorded at `dev-docs/upstream-scroll-memory-20261025/acceptance.md`.
- [x] Initial local package commit created; follow-up commit pending for parity regression, system-skill snapshot bump, and Chromium verification. No push/PR/CI/release in this assignment.

## Completed

Applied the four assigned upstream references only to this package's owned files. Adapted patch integration to preserve local assertions and used a private `react-virtuoso@4.18.3` package instance for browser verification. Raised the synchronized system-skill snapshot to 62; the installed-directory fast path checks presence only, so an unchanged v61 stamp would skip changed/new Skill content. Shared `package.json`, `package-lock.json`, and specifications were not changed; integration owner should add `scripts/memory-skills.test.mjs` to the test script.

## Verification

See `dev-docs/upstream-scroll-memory-20261025/acceptance.md` for commands, results, browser evidence directories, private package SHA, initial misrouted browser evidence, Chromium timeout evidence and diagnostic limit, and current Cargo constraint.

## Blockers and unknowns

- Rust test results remain pending while the parent task uses Cargo jobs.
- Shared test command integration remains with the main agent because package manifests are shared files.
- No shared CI/mainline/release was invoked.

## Next step

Run focused Rust memory-rule/evolution tests when the parent confirms the Cargo slot is free, then review and commit only this task record, its evidence, and assigned package files.
