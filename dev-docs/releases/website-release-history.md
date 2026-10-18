# MoXBots public release history

Task: `MOXBOTS-RELEASE-NOTES-001` (2026-10-18).

The user requested a cumulative update summary accessible from the download page. Public source is `services/website/download/changelog.html` and its content-addressed CSS. The tracked download index retains a history link for future page releases.

## Content and channel evidence

Summaries cover 0.5.5–0.5.11 and are derived from the corresponding committed release records and tagged source. Source tag v0.5.10 is an ancestor of v0.5.11; 0.5.10 was not independently published as stable. Its changes are presented as included in 0.5.11. Existing own-updater 0.5.11 publication is recorded in `moxbots-0.5.11.md`. The live manual page observed on 2026-10-18 still exposes signed/notarized macOS 0.5.6; candidate macOS/Windows metadata in the repository must not be substituted for that live page.

The public history explicitly distinguishes published channel availability from installed clients and real business acceptance. It makes no claim of Windows, all Host/model paths or natural renewal acceptance.

## Acceptance and delivery

- [x] Plain-language cumulative content and seven version anchors.
- [x] Local page and production-shaped download-link preview prepared.
- [ ] Independent UI review and responsive interaction acceptance.
- [ ] Normal CI, main integration and remote containment.
- [ ] Static overlay published and actual public link/navigation verified.

No desktop/app or business write is needed for this static change. Original 0.5.11 signed source remains frozen; later documentation commits do not enter that binary.

## Scoped static overlay runbook

The production entry is a fresh read of `/var/www/moxbots-website/current`, not the repository's future download index. The initial observed index was 6335 bytes / SHA-256 `623bc1a37d5361de04cd0499e7dbd4f6ae47a7d32e377e47ce480d5880ceebaf`. Insert only the exact `release-history-link` anchor into that live HTML; retain all original scripts, manifests, package references and home assets byte-for-byte. Add the history HTML/CSS. Record all three resulting hashes.

Use the already configured cloud SSH identity without exposing key material. The updater signing identity is not used for static website access. Acquire nonblocking exclusive locks `moxbots-cloud-model-center.lock`, `moxbots-login-ux.lock`, `moxbots-nginx-deploy.lock`, and `moxbots-website-release.lock` under `/run/lock`. A busy lock or changed source pointer/index stops publication.

Back up the old index and target link in a private task directory. Copy the current tree into a new immutable release, preserve symlinks and existing files, verify every original file except the intentional index insertion remains identical, then atomically replace `current` after a fresh pointer/index CAS check. Do not reload Nginx or restart services. Compare Nginx configuration and cloud service PID before/after. Retain the old tree and a rollback script that only switches back if the current pointer is still owned by this release, under the same four locks.

After publication check normal TLS page/CSS hashes, original manifest/script hashes, unchanged updater manifest, and the real download→history→version anchor→download navigation on desktop and narrow screens. Keep exact private receipts and original failure logs. If checks fail, retain evidence and selectively roll back only this owned pointer; never overwrite a later website release.

Private operational evidence lives in the project pointer `work/release-notes-001-20261018/`; it is not a substitute for the main Git record. Final Git refs and live acceptance will be appended after publication.
