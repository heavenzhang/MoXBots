# Build and publish the MoXBots 0.5.10 Windows download

Task ID: `MOXBOTS-0510-WINDOWS-DOWNLOAD-20261018`

- Canonical repository: `https://github.com/heavenzhang/MoXBots.git`
- Base main: `9269dd8c52c423a180bfba366c8f0434a90db005`
- Frozen app source: `v0.5.10` / `400b746a4841bab8e4b99d8f83479fd54925c205`
- Target: `https://140.143.183.232/download/` and `/download/packages/` only.

## To do and acceptance

- [ ] Add a pinned, isolated `windows-latest` package workflow; verify source commit, version/product identity, MoXBots-specific NSIS hooks, toolchains, installer size/SHA and Authenticode result.
- [ ] Run the workflow, independently retrieve the one-day private artifact, and preserve the runner metadata and exact hash receipt.
- [ ] Prepare download-page metadata with accurate signing status and `windowsUpdater: unsupported`; do not claim Windows installation/runtime validation.
- [ ] Publish only through the existing website maintenance locks, backup, immutable release folder and current-pointer CAS; verify UI and complete normal-TLS package GET.

## Completed

- [x] Confirmed latest remote main and started this clean isolated branch from exact main SHA.
- [x] Verified source tag `v0.5.10` points to the release-frozen app commit.
- [x] Added a version-pinned workflow copied from the accepted 0.5.9 path, with its exact 0.5.10 source SHA, distinct concurrency/artifact names, MoXBots isolated NSIS hooks, fixed Node/npm/Rust/NSIS and disabled updater artifacts.

## Limits and blockers

- App source must remain exactly `400b746a`; later main commits are only the builder recipe and must never enter the Windows release source.
- No Authenticode certificate/Actions secret is configured. The accepted workflow may produce `NotSigned`; publish only with that status disclosed and expected Windows security prompts explained.
- The user confirmed no website SSH Host alias exists. A dedicated least-privilege website upload identity is absent; the macOS updater key cannot be reused for website writes. Website publication stays blocked until an authorized channel is configured.
- Do not modify `/updates/*`, stable updater data, Nginx/TLS/auth/Host or the daily desktop app.

## Next action

Validate and push the builder branch, run the private Windows workflow from this branch, then inspect the complete candidate and update this record before opening/merging the page metadata change. Request only the missing website upload channel before any static-site mutation.
