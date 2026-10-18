# MoXBots 0.5.10 download-channel preparation

Task: `MOXBOTS-0510-DOWNLOAD-PAGE-20261018`
Frozen application source: tag `v0.5.10`, commit `400b746a4841bab8e4b99d8f83479fd54925c205`
Current canonical main at preparation: `dcf8d9a60976c160e2b2aca33313c668c071132c`

## Package evidence

The Windows x64 installer was built by the pinned Windows workflow on main run [39094065083](https://github.com/heavenzhang/MoXBots/actions/runs/39094065083), builder commit `dcf8d9a60976c160e2b2aca33313c668c071132c`, from frozen source `400b746a4841bab8e4b99d8f83479fd54925c205`. The Windows NSIS build step took 39m26s and the run completed successfully. Its private one-day artifact was used only to transfer the package locally; it is not a public GitHub release.

`MoXBots_0.5.10_x64-setup.exe` is 339,637,031 bytes with SHA-256 `d0c9d526b7c1e0c18702d6d224848549c5be61d35e433d7e59f69acb73fdd848`. Independent local checks matched the runner metadata, identified a PE32 NSIS self-extracting installer, and confirmed the PE security directory has no Authenticode certificate. The Windows runner reports `NotSigned`, analytics disabled, and Windows updater artifacts disabled. No Windows installation or runtime test was performed.

The macOS Apple Silicon website ZIP is 352,465,403 bytes with SHA-256 `48f6a563fc5dd29762c20e1a175bb56096d20e4b800f245a0b4337fc82ba8ced`. The package review records Developer ID signing, Apple notarization, ticket validation, and Gatekeeper acceptance. This exact package has not been launched in an isolated QA user.

## Page preparation

`services/website/trial-release.json` and the new content-addressed page manifest point to same-origin package paths under `/download/packages/`. Prior hashed manifests and assets remain intact. The new Mac entry links to an immutable local release-note file; the page script accepts only same-origin `/download/notes/` URLs for this field. The release note states that production web-login return and terminal recovery still require a service protocol absent from 0.5.10, so the package must not be presented as a fix for the reported post-login desktop failure. The Windows card discloses its unsigned state, SmartScreen/Unknown Publisher risk, disabled analytics, manual-only updates, and lack of Windows runtime acceptance.

The local in-app browser preview at `http://127.0.0.1:4319/download/` rendered the Mac and Windows cards with the expected version, size, same-origin links, safety notices, and acceptance boundary. Its accessibility tree confirms both links, versions, exact local package paths, unsigned/SmartScreen disclosure and the login-return limitation. This evidence is local preview only; no live page change or public download has occurred. Desktop/mobile visual overflow review remains pending.

## Public state and gates

A fresh normal-TLS GET of [`/download/`](https://140.143.183.232/download/) still showed macOS 0.5.6 and no Windows card. The HTML SHA-256 was `623bc1a37d5361de04cd0499e7dbd4f6ae47a7d32e377e47ce480d5880ceebaf`; it referenced `releases.98f42775b3e8.json` with SHA-256 `98f42775b3e8ab59a38ec56591bba57a9e6f8dacc3d067e4ce88aa811015c08e`. No server write has occurred.

The website upload route remains blocked: there is no configured website SSH Host alias or dedicated least-privilege website credential. Do not reuse the updater key for website static writes. Once a scoped route exists, publish only under the existing website locks, backup, immutable release directory and current-pointer CAS, then verify the public page and complete normal-TLS downloads against the recorded hashes.

The reported symptom is “after logging in on the website, the desktop client cannot be used normally.” The frozen 0.5.10 notes explicitly leave production login return and automatic recovery unavailable pending the formal service protocol. Stable updater promotion remains separate and must not be described as fixing that symptom. Exact-package native QA, updater stable promotion, public website deployment, and Windows runtime acceptance remain unverified.
