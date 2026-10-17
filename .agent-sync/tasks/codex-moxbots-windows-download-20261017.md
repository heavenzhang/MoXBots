# MoXBots Windows 0.5.9 download package

Task ID: `MOXBOTS-059-WINDOWS-DOWNLOAD-20261017`

- Repository: `https://github.com/heavenzhang/MoXBots.git`
- Frozen application source: tag `v0.5.9`, commit `9f93b3304ee6f06434d8d09754d3e59d4d676d0d`
- Download page: `https://140.143.183.232/download/`
- Acceptance record: `dev-docs/moxbots-059-windows-download.md`

## Scope and exclusions

Build an x64 Windows NSIS installer for the already released 0.5.9 source and publish it only on the existing MoXBots cloud download page. The approved private GitHub Actions artifact is short-lived transport only. Do not publish a GitHub Release or Windows updater manifest, alter `/updates/*`, touch Nginx/TLS/auth/Host services, modify macOS assets, or operate the daily desktop client.

The Windows updater remains unsupported (the endpoint returns HTTP 204). Authenticode signing is not configured; the page must state `NotSigned` and disclose possible Unknown Publisher / SmartScreen warnings. The build did not enable analytics.

## Completed

- [x] Verify frozen source, current main, website and unsupported Windows updater route.
- [x] Review isolated MoXBots identity and NSIS hooks; keep MyAgents behavior separate and disable updater artifacts.
- [x] Merge PR #102 with the Windows build workflow and the one-task deployment designation.
- [x] Fix the Node/npm mismatch in PR #106; all six normal checks passed and the PR merged as `3db9a21103c081aa69fb7897bfcd8ff3dd0d4c5f`.
- [x] Merge download-page structure PR #107 after all six normal checks passed; main contains it at `b5781988c39c0b7560886e872b0820c135a1f4c5`.
- [x] Build the pinned 0.5.9 Windows package successfully in run `39044508103`. Full job 36m49s; installer step 34m22s.
- [x] Retrieve the private, one-day artifact and verify exact installer size (339,742,567 bytes) and SHA-256 (`4db0581ec68a27de136e4d7c2ba2c712a90cfa3d47fba602db4a4b6f54aa18fc`) against the runner metadata; the Windows build job verified product identity, frozen source and installer version metadata. It is unsigned, analytics are disabled and Windows updater artifacts are disabled.
- [x] Prepare the Windows-ready content-addressed page manifest, preserving the macOS 0.5.6 entry; visually inspect desktop and 390 px mobile states in the in-app browser. No horizontal overflow.

## Remaining

- [ ] Run normal CI, merge the verified Windows metadata/page follow-up, and verify remote main contains it.
- [ ] Configure an authorized SSH upload path for the existing website server. The user confirmed there is no existing Host alias; direct root SSH is denied and no registered identity is available. Do not reuse unrelated keys or ask for private-key contents.
- [ ] Upload the installer to a new immutable `/download/packages/` path under the existing website lock/backup/release-directory/CAS runbook. Keep the prior page and release for rollback.
- [ ] Promote only the download-page manifest/reference and package; verify public UI, normal TLS full GET, server size/SHA and existing routes.
- [ ] Record the server receipt and public evidence, then remove the temporary Actions artifact after successful cloud verification. Do not claim Windows installation/runtime acceptance.

## Current state

The build is complete and independently hashed. The ready-state website source is prepared on task branch `codex/moxbots-059-windows-package-metadata`, with macOS 0.5.6 preserved. The public page has not changed. Deployment is blocked only on secure authorized server access; no SSH Host alias or identity exists. Exact build and UI evidence are in `dev-docs/moxbots-059-windows-download.md`.
