# MoXBots public release history

Task: `MOXBOTS-RELEASE-NOTES-001` (2026-10-18).

The user requested a cumulative update summary accessible from the download page. Public history is the marked `RELEASE-HISTORY` section in `services/website/download/index.html`, styled by the scoped `download.ee1e5c881c12.css`. Its direct URL is `https://140.143.183.232/download/#release-history`. The tracked download index retains a history link for future page releases.

## Content and channel evidence

Summaries cover 0.5.5–0.5.11 and are derived from the corresponding committed release records and tagged source. Source tag v0.5.10 is an ancestor of v0.5.11; 0.5.10 was not independently published as stable. Its changes are presented as included in 0.5.11. Existing own-updater 0.5.11 publication is recorded in `moxbots-0.5.11.md`. The live manual page observed on 2026-10-18 still exposes signed/notarized macOS 0.5.6; candidate macOS/Windows metadata in the repository must not be substituted for that live page.

The public history explicitly distinguishes published channel availability from installed clients and real business acceptance. It makes no claim of Windows, all Host/model paths or natural renewal acceptance.

## Acceptance and delivery

- [x] Plain-language cumulative content and seven version anchors.
- [x] Local page and production-shaped download-link preview prepared.
- [x] Independent content/source and actual desktop/320px screenshot review; Root actual link/anchor/return interactions and 1280/390/320px no-overflow checks. Reviewer did not independently replay those actions. A narrow-title wrap suggestion was fixed with an intact phrase.
- [x] Initial source PR131 passed nine applicable checks (one conditional iOS skip) and merged at `96010acb710dfa864ddad979fe1d0b6dc49df69a`.
- [ ] Existing-route compatibility fix and final delivery CI/main.
- [ ] Static overlay published and actual public link/navigation verified.

No desktop/app or business write is needed for this static change. Original 0.5.11 signed source remains frozen; later documentation commits do not enter that binary.

## Scoped static overlay runbook

The production entry is a fresh read of `/var/www/moxbots-website/current`, not the repository's future download index. The initial observed index was 6335 bytes / SHA-256 `623bc1a37d5361de04cd0499e7dbd4f6ae47a7d32e377e47ce480d5880ceebaf`. Insert only the history link, one additional stylesheet reference, and the bounded marked history section into that live HTML. Removing those exact three insertions must recover the original HTML byte-for-byte. Add only the scoped content-addressed CSS; retain every original asset, script, manifest and package reference. Record both resulting file hashes.

Use the already configured cloud SSH identity without exposing key material. The updater signing identity is not used for static website access. Acquire nonblocking exclusive locks `moxbots-cloud-model-center.lock`, `moxbots-login-ux.lock`, `moxbots-nginx-deploy.lock`, and `moxbots-website-release.lock` under `/run/lock`. A busy lock or changed source pointer/index stops publication.

Back up the old index and target link in a private task directory. Copy the current tree into a new immutable release, preserve symlinks and existing files, verify every original file except the intentional index insertion remains identical, then atomically replace `current` after a fresh pointer/index CAS check. Do not reload Nginx or restart services. Compare Nginx configuration and cloud service PID before/after. Retain the old tree and a rollback script that only switches back if the current pointer is still owned by this release, under the same four locks.

After publication check normal TLS page/CSS hashes, original manifest/script hashes, unchanged updater manifest, and the real download→history→version anchor→download navigation on desktop and narrow screens. Keep exact private receipts and original failure logs. If checks fail, retain evidence and selectively roll back only this owned pointer; never overwrite a later website release.

Private operational evidence lives in the project pointer `work/release-notes-001-20261018/`; it is not a substitute for the main Git record. Final Git refs and live acceptance will be appended after publication.

## Public-route failure and corrected form

The first immutable overlay passed filesystem/inventory checks but actual public navigation returned 404 for `/download/changelog.html`. The existing Nginx allowlist permits `/download/`, `download.<hash>.css/js` and `releases.<hash>.json`; it does not serve arbitrary HTML. The old pointer was restored by the audited owned rollback under all four locks, with original failure receipts preserved. No Nginx/config/service/updater change was made.

The corrected form embeds the same seven-version section in the existing download page and links directly with `#release-history`. The additional CSS name matches the already deployed allowlist. Version anchors and the `#main` return work without JavaScript. Root actual IAB checked desktop/320/390px, seven versions, 0.5.7 main/backup wording, version navigation and return to the unchanged 0.5.6 manual card. This replaces the unsupported standalone page, not its acceptance evidence.
