# MoXBots Windows 0.5.9 download package

Task ID: `MOXBOTS-059-WINDOWS-DOWNLOAD-20261017`

- Repository: `https://github.com/heavenzhang/MoXBots.git`
- Task branch: `codex/moxbots-059-windows-package`
- Original base: `1553ab7cf23f4e1d5c00068592198b758f08f6b3`; latest reviewed `main` `428ffd94ce2e5eedfb150c28dccecf201c6b2edc` is integrated into the task branch before the next CI run.
- Build PR: https://github.com/heavenzhang/MoXBots/pull/102

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
- [ ] Review Windows packaging workflow and MoXBots-only NSIS hooks in PR/CI; the NSIS 3.13 archive is pinned by the frozen-source helper and its two local verification tests pass.
- [ ] Build installer from the pinned 0.5.9 source; verify product/version, installer metadata, size, SHA-256, Authenticode and analytics states.
- [ ] Resolve the SSH Host alias needed to use the existing authorized publishing identity; recursive inspection of the local SSH config and Include files found no alias resolving to `140.143.183.232`. Once resolved, upload to a new immutable website release path using its lock/backup/CAS rollback procedure.
- [ ] Update the download page and manifest only after the cloud file is verified; verify public UI and full TLS download size/SHA.
- [ ] Delete the temporary GitHub Actions artifact after cloud verification and record the final receipt.

## Current state

The generic Windows script builds `MyAgents / com.myagents.app`, and the existing MyAgents NSIS hook also searches `.myagents` child-process paths. A dedicated MoXBots profile now selects `MoXBots / com.moxbot.app`, uses `.moxbot`-scoped hooks, and disables updater artifacts for this download-only Windows build. The package workflow checks out the frozen release source and overlays only the reviewed Windows packaging recipe.

The download-page candidate is isolated under `output/download-windows-059-20261017/candidate/download`. A private local browser preview confirmed the Mac and Windows cards, exact-source/hash fields, the unsigned and updater-limit disclosures, and the Windows SHA copy interaction. The synthetic preview manifest is separate from the deployment manifest and must never be published. The 390px mobile viewport had no horizontal overflow.

Current stage: PR #102 includes the latest reviewed `main` and the explicit one-task website deployment designation in `.agent-sync/plan.md`. Main advanced from `b11e10b` to `428ffd9` with one unrelated `ConfirmDialog.tsx` visual style change; it was reviewed and integrated without conflict. The next push restarts all six normal CI checks on the synchronized head. The user directed use of an existing SSH Host alias, but no local config/Include alias resolving to the website server was found; use remains unresolved until the alias name can be matched. Next: push the synchronized branch, wait for normal checks, merge only once green, dispatch the pinned Windows package workflow, inspect the private artifact and build metadata, then publish only to the existing cloud download page once the configured server alias is identified. No package has been built or published yet; the public download page has not changed.
