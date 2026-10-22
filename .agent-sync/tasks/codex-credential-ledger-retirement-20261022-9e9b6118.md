<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/credential-ledger-retirement-20261022 -->
<!-- git-project-sync-task:base=13b5e155ea2b23632aec2734f34a6b581eb2bfeb -->
<!-- git-project-sync-task:status=in-progress -->
<!-- git-project-sync-task:scaffold=false -->

# MOXBOTS-MOBILE-CI-LEDGER-20261022 — retired owner observation repair

## Objective

Continue the existing sole credential_slots source-writer lane assigned to mobile owner01a12b99 by desktop/sharedCI/main owner01a12bc2. PR192/headbcb33185 original Linux39768392014 fails after133 successful rounds at helper2. The exact same credential source as main13b5 now reports unowned regular owner inode/nlink0/uid1001/mode100644/len24 at the initial pathname preflight. Repair that observed boundary without treating a retired observation as ownership. Keep daily Mac, original101, Keychain, Apple authentication, published5182 and frozen5191 unchanged.

## Acceptance criteria

- [x] Independently read original raw logSHA af47baac43c49dafea11f0809f690688684ff7f7b126899a67ac5aa66b6204bf and verify source matches main13b5/e34484d9.
- [x] Isolate a new clean worktree from verified actualmain13b5; original diagnostic/mobile worktrees preserved.
- [x] Deterministic real-unlinked-metadata regression RED on unchanged original guard and GREEN on bounded repair.
- [x] Owned nlink0, unsafe type/mode/size, live hardlinks/symlinks, malformed owner/PID and namespace guards remain closed; real acquisition still mandatory before ledger mutation.
- [x] Exact source isolated module suite and unchanged200round/four-process/120s total+15s per-round test pass; evidence scopes explicit.
- [ ] Local commit with body, exact patch/SHA/evidence to desktop sole integration owner; no push/sharedPR/CI here. Desktop evaluates changed-head PR192 CI/main before release.

## Completed

Original log/source identity verified; deterministic original-guard RED2pass/1fail and repaired focusedGREEN5pass. Exact-source isolated module31pass/0fail/1ignored in41.03s including unchanged200x4 parent. Rustfmt/diff check pass; desktop/Linux review and main gates still pending.

## Verification

Private evidence remains under pointer output/mobile-testflight-20261022/ledger-retirement-*. The local probe copies exact source (only inner-doc adaptation), uses app_dirs=None, disabled OS-store support with panic shims, and synthetic TempDirs. It is not full Tauri or LinuxCI and cannot access real OS credentials. No new daemon/VM or production probe.

## Blockers and unknowns

Actual LinuxCI now establishes the failed path observation was a retired inode; the exact kernel scheduling was not traced. A deterministic fixture models the observed attributes with a real open FD after normal fixture lock removal, rather than asserting a sleep-dependent schedule. Full Linux/main delivery remains desktop-owned. TestFlight Apple本人登录 and originalAir quiet-fact remain separate gates.

## Next step

Hand back the exact local-only commit/patch and private evidence to desktop01a12bc2. It independently reviews and selects the patch into originalPR192 for the necessary changed-head LinuxCI/main. Do not push or trigger CI here.
