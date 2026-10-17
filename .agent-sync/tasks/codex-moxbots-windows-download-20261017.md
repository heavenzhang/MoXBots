# MoXBots Windows 0.5.9 download package

Task ID: `MOXBOTS-059-WINDOWS-DOWNLOAD-20261017`

## Scope

Build an x64 Windows NSIS installer for the frozen `v0.5.9` application source, transfer it through the user-approved private GitHub Actions artifact for one day, and publish it only on the existing MoXBots cloud download page. Do not publish a Windows updater manifest, a GitHub Release, or touch the daily desktop client.

- Application source tag: `v0.5.9`
- Frozen application commit: `9f93b3304ee6f06434d8d09754d3e59d4d676d0d`
- Download page: `https://140.143.183.232/download/`
- Windows auto-update endpoint remains unsupported (HTTP 204).
- Authenticode certificate is not configured; the installer will be unsigned and the page must disclose that.
- Actions artifact is temporary/private only; final installer is served from the cloud website server.

## Checklist

- [x] Verify canonical repository, frozen source tag, current `main`, download page, and unsupported Windows updater route.
- [x] Obtain user approval for a private, one-day GitHub Actions artifact as temporary package transport.
- [x] Audit generic Windows identity and installer hooks; preserve MyAgents behavior and isolate MoXBots paths.
- [ ] Review Windows packaging workflow and MoXBots-only NSIS hooks in PR/CI.
- [ ] Build installer from the pinned 0.5.9 source; verify product/version, installer metadata, size, SHA-256, Authenticode and analytics states.
- [ ] Obtain the existing authorized SSH publishing identity; upload to a new immutable website release path using its lock/backup/CAS rollback procedure.
- [ ] Update the download page and manifest only after the cloud file is verified; verify public UI and full TLS download size/SHA.
- [ ] Delete the temporary GitHub Actions artifact after cloud verification and record the final receipt.

## Current state

The generic Windows script builds `MyAgents / com.myagents.app`, and the existing MyAgents NSIS hook also searches `.myagents` child-process paths. A dedicated MoXBots profile now selects `MoXBots / com.moxbot.app`, uses `.moxbot`-scoped hooks, and disables updater artifacts for this download-only Windows build. The package workflow checks out the frozen release source and overlays only the reviewed Windows packaging recipe.

Pending: PR/CI, actual Windows package build, and authorized SSH identity for the cloud website upload. No package has been built or published yet.
