<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/moxbots-0510-download-page-20261018 -->
<!-- git-project-sync-task:base=dcf8d9a60976c160e2b2aca33313c668c071132c -->
<!-- git-project-sync-task:status=in-progress -->

# MOXBOTS-0510-DOWNLOAD-PAGE-20261018

## Objective

Prepare the existing self-hosted MoXBots download page for the verified macOS and Windows 0.5.10 files. Keep package delivery on `140.143.183.232`; GitHub Actions is only a private, one-day Windows artifact transport. Record that this release does not include the pending production web-login-return protocol. The updater stable feed and website download channel are separate.

## Acceptance criteria

- [x] Build the Windows x64 installer from frozen `v0.5.10` source and independently match local file size/SHA against runner metadata.
- [x] Publish source metadata with exact Mac/Windows versions, file sizes, hashes, signature states, source commit, same-origin package URLs, and explicit acceptance boundaries.
- [x] Preserve prior hashed assets and provide content-addressed JS, manifest, and release notes.
- [x] Validate local page behavior for both download cards and safety disclosures in Codex in-app browser.
- [ ] Run required repository checks, commit and push the branch, pass normal PR CI, merge to `main`, and verify remote inclusion.
- [ ] Obtain the already-missing least-privilege website upload path; deploy under the existing locks, backup, immutable directory and current-pointer CAS; verify public page and complete normal-TLS downloads against SHA.
- [ ] Keep Mac updater stable promotion separate until exact-candidate native QA and the user's release-target decision are resolved.

## Completed

- Frozen app source/tag: `v0.5.10` / `400b746a4841bab8e4b99d8f83479fd54925c205`.
- Windows builder run `39094065083` succeeded on `main` builder SHA `dcf8d9a60976c160e2b2aca33313c668c071132c`. The NSIS build step took 39m26s. Private artifact `moxbots-windows-x64-0.5.10` (ID `12123744992`) was retrieved locally; it is not a GitHub Release.
- Windows installer `MoXBots_0.5.10_x64-setup.exe`: 339,637,031 bytes; SHA-256 `d0c9d526b7c1e0c18702d6d224848549c5be61d35e433d7e59f69acb73fdd848`; PE NSIS installer; metadata reports `NotSigned`, analytics off, Windows updater unsupported. Local PE security-directory verification confirms no Authenticode certificate table. No Windows install/runtime test was performed.
- macOS website ZIP: 352,465,403 bytes; SHA-256 `48f6a563fc5dd29762c20e1a175bb56096d20e4b800f245a0b4337fc82ba8ced`; Developer ID signed, Apple notarized, Gatekeeper accepted in package review. It has not been launched in an isolated QA user.
- Download metadata uses same-origin `/download/packages/` URLs; Windows remains manual-only. Immutable local notes disclose that production web-login return/terminal recovery still depends on a service protocol absent from 0.5.10 and that this candidate must not be represented as fixing the reported web-login issue. Windows runtime acceptance is also explicitly unverified.
- Local in-app browser preview shows the Mac and Windows cards, exact versions/sizes, signed/notarized and unsigned states, SmartScreen/Unknown Publisher warning, analytics-off, manual Windows-updater notice, Windows runtime boundary, and visible Mac login-return limitation.
- The exact live preflight still shows only Mac 0.5.6 and no Windows card. Public HTML SHA-256 `623bc1a37d5361de04cd0499e7dbd4f6ae47a7d32e377e47ce480d5880ceebaf`; referenced live manifest `releases.98f42775b3e8.json`, SHA-256 `98f42775b3e8ab59a38ec56591bba57a9e6f8dacc3d067e4ce88aa811015c08e`. No server write has occurred.

## Scope and boundaries

- Canonical Git destination: `https://github.com/heavenzhang/MoXBots.git`, base `main` SHA `dcf8d9a60976c160e2b2aca33313c668c071132c`.
- Public target: `https://140.143.183.232/download/` and immutable files under `/download/packages/` and `/download/notes/` only. No GitHub binary release. Preserve current design and old content-addressed assets. Do not change Nginx, TLS, auth, Host or updater endpoints.
- The user previously confirmed there is no website SSH Host alias. Repository/site review found no authorized website upload identity. Do not reuse the updater private key for website writes.
- The running daily `MoXBots.app` must not be opened, replaced, quit, installed or restarted. No production login-return service deployment is in this branch.

## Verification

- Local Windows artifact metadata and independent SHA/size: exact match; `file` identifies PE32 NSIS self-extracting installer.
- Local PE security directory: certificate offset/size both zero, consistent with `NotSigned`.
- `node --check` passes for the new content-addressed page script; `git diff --check` passes on the branch.
- A fresh local IAB tab at `http://127.0.0.1:4319/download/` rendered both cards and notices. This is local UI evidence only, not public deployment or responsive screenshot acceptance.

## Blockers and unknowns

- Website publication needs a dedicated least-privilege upload identity or approved secure route, which is not currently configured.
- Exact Mac package native QA entry is still pending. The user was given steps to create a separate standard macOS user or provide a VM session; no active isolated session has been supplied.
- The user symptom is “after logging in on the website, the desktop client cannot be used normally.” Frozen 0.5.10 notes say production login return/automatic recovery remain unavailable pending a service protocol; do not promote 0.5.10 as a fix for that symptom.
- Public website deployment, complete public downloads, Windows runtime acceptance, and Mac exact-package native UI acceptance are not complete.

## Next step

Run branch-specific static/manifest checks, stage only the intended website files and this record, review the staged diff, then commit/push and open a normal PR. After PR CI/main delivery, request the missing website upload identity and perform public deployment only after the applicable acceptance gates pass.
