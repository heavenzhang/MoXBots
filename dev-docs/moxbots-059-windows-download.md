# MoXBots 0.5.9 Windows x64 download acceptance

Task: `MOXBOTS-059-WINDOWS-DOWNLOAD-20261017`
State: Windows build, local page acceptance and mainline metadata delivery complete; public website deployment is blocked on configuring authorized server access. The live page still serves macOS 0.5.6 only.

## Frozen build

- Application source: tag `v0.5.9`, commit `9f93b3304ee6f06434d8d09754d3e59d4d676d0d`.
- Builder source: main commit `3db9a21103c081aa69fb7897bfcd8ff3dd0d4c5f`.
- Workflow: run [39044508103](https://github.com/heavenzhang/MoXBots/actions/runs/39044508103), success.
- Full job duration: 36m49s (15:19:12–15:56:01 UTC); installer build step: 34m22s (15:20:13–15:54:35 UTC).
- The first attempt, run `39042598217`, failed before compilation in 1m47s because the workflow used npm 11.15.0 while the frozen source requires npm 11.19.0. PR #106 aligned the workflow with Node 24.20.0/npm 11.19.0; application source remained frozen.
- Private one-day Actions transfer artifact: `moxbots-windows-x64-0.5.9`, artifact ID `12106126793`, 339,827,323 bytes. The artifact is transport only; no GitHub Release was created. Retrieving it to this Mac took about 1h28m over its existing proxy connection. It expired at `2026-10-18T15:54:38Z`; the verified installer copy remains in the private local task workspace.

## Installer verification

- File: `MoXBots_0.5.9_x64-setup.exe`
- Size: 339,742,567 bytes.
- SHA-256: `4db0581ec68a27de136e4d7c2ba2c712a90cfa3d47fba602db4a4b6f54aa18fc`.
- Product identity: `MoXBots`, identifier `com.moxbot.app`, version `0.5.9`, Windows x64.
- Authenticode: `NotSigned`; page explicitly warns about “Unknown Publisher” / SmartScreen.
- Analytics: disabled. Windows updater artifacts: disabled; Windows auto-update is unsupported.
- Independent local check recalculated exact size and SHA-256 and matched `release-metadata.json`. macOS `file` recognizes the executable as a PE NSIS self-extracting installer. The Windows build job also verified the app executable and installer product/version metadata. The NSIS payload was not executed or installed on Windows during this task; Windows runtime acceptance remains unverified.

## Download page

- PR #102 (build workflow and one-task deployment scope), PR #106 (runtime pin fix), PR #107 (download-page structure), and PR #110 (Windows metadata) all merged normally after their six standard checks passed. PR #110 head `875b841d12065e24530840bd3177101eba989152` is contained in remote main merge commit `54456225412e892a6ad15704cdf6dc4acffce8e1`.
- Candidate manifest preserves the macOS 0.5.6 record and adds the verified Windows metadata. The Windows URL is same-origin `/download/packages/MoXBots_0.5.9_x64-setup.exe`; it will resolve once the immutable package is installed on the website server.
- In-app browser acceptance at desktop and 390×844 mobile showed the Windows card as ready, version `0.5.9`, size `339.7 MB`, unsigned/SmartScreen disclosure, analytics disabled, updater unavailable, source link and exact SHA-256. No horizontal overflow at 390 px. The existing macOS 0.5.6 card remains unchanged.
- The candidate metadata is in main, but has not been deployed. A normal TLS readback at `2026-10-18 01:52 +08:00` still showed HTML SHA-256 `623bc1a37d5361de04cd0499e7dbd4f6ae47a7d32e377e47ce480d5880ceebaf` referencing `releases.98f42775b3e8.json`; that live manifest SHA-256 is `98f42775b3e8ab59a38ec56591bba57a9e6f8dacc3d067e4ce88aa811015c08e` and contains only macOS 0.5.6. Public Windows UI, direct package GET and server-side size/SHA verification remain pending.

## Deployment boundary

The user confirmed there is no existing SSH Host alias for `140.143.183.232`; local direct root SSH was denied, no local agent identity is available, and the repository has no Actions secrets, variables or environments for server deployment. No unrelated key will be reused. The authorized website deployment is blocked until a secure server upload path is configured. No live website write, package upload, Windows install, or daily client operation has occurred.
