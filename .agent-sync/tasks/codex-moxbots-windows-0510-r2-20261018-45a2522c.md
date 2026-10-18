<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/moxbots-windows-0510-r2-20261018 -->
<!-- git-project-sync-task:base=9269dd8c52c423a180bfba366c8f0434a90db005 -->
<!-- git-project-sync-task:status=in-progress -->

# MOXBOTS-0510-WINDOWS-DOWNLOAD-20261018

## Objective

Build a Windows x64 installer from the exact frozen MoXBots `v0.5.10` source and publish it on the existing download page, preserving existing releases and the daily app.

## Acceptance criteria

- [ ] A version-pinned `windows-latest` workflow validates source commit, version/product identity, MoXBots-specific installer hooks, pinned toolchains and installer metadata.
- [ ] Independently retrieve the one-day private Actions artifact and verify its size and SHA-256 against runner metadata; report the actual Authenticode result.
- [ ] Prepare page metadata that accurately reports Authenticode and `windowsUpdater: unsupported`; no unsupported Windows updater claim.
- [ ] Publish through existing website maintenance locks, backup, immutable release directory and current-pointer CAS; preserve rollback and every existing asset.
- [ ] Verify public download-page UI plus complete normal-TLS package GET with exact size and SHA. Do not infer install/runtime acceptance from package or download success.

## Scope and boundaries

Canonical repository `https://github.com/heavenzhang/MoXBots.git`, base main `9269dd8c52c423a180bfba366c8f0434a90db005`; frozen app source tag `v0.5.10`, commit `400b746a4841bab8e4b99d8f83479fd54925c205`. Target only `https://140.143.183.232/download/` and its immutable `/download/packages/` Windows asset and metadata. Do not modify `/updates/*`, Nginx/TLS/auth/Host, existing assets, or operate the daily desktop app. The updater key is not a website upload credential.

## Completed

- [x] Verified exact source tag and clean remote main; `observe` and `start` passed on the isolated task worktree.
- [x] Added a dedicated workflow copied from the accepted 0.5.9 process, pinned to the 0.5.10 SHA, with distinct artifact/concurrency/output names and disabled updater artifacts.
- [x] Added the deployment scope and publication gates to the shared plan.
- [ ] Workflow CI, Actions build, independent artifact verification, page metadata/main delivery and public website publication remain pending.

## Verification

- Base and current remote main at task start: `9269dd8c52c423a180bfba366c8f0434a90db005`.
- `v0.5.10^{}` resolves to `400b746a4841bab8e4b99d8f83479fd54925c205`; app identity in Tauri config is `MoXBots`, `com.moxbot.app`, `0.5.10`.
- `git diff --cached --check`: PASS before initial commit.
- Windows build workflow not run yet; no 0.5.10 Windows artifact or public website change exists.

## Blockers and unknowns

- No Authenticode certificate or Actions signing secret is configured. If the artifact is `NotSigned`, the site must disclose the unsigned status and possible SmartScreen/Unknown Publisher prompt.
- The user confirmed there is no existing website SSH Host alias; earlier 0.5.9 work found no authorized website deployment identity or repository Actions secret. A dedicated least-privilege website upload channel is required before website writes. Do not reuse updater credentials.
- Windows installation and runtime behavior remain unverified unless separately tested on Windows.

## Next step

Run PR CI for this pinned workflow, merge only after all required checks pass, dispatch the private Windows build from main, independently validate the original artifact, then request the missing website upload identity before publication.
