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
- [x] Corrected source PR135 passed nine applicable checks (one conditional iOS skip); normally merged at `baa1a637f40b56b7ff64d4f7e8473a87b6bf8c47`, containing frozen website source `1bf1a4896c49179ad87504ceab11ac812efac92d`.
- [x] Corrected two-file overlay published; actual public entry, version anchors, return and desktop/320/390px no-overflow verified. Independent prepublication source/screenshot/script review passed. A separate postpublication reviewer could not run because the account usage limit was reached; Root verified the actual public bytes and interactions.

No desktop/app or business write is needed for this static change. Original 0.5.11 signed source remains frozen; later documentation commits do not enter that binary.

## Scoped static overlay runbook

The production entry is a fresh read of `/var/www/moxbots-website/current`, not the repository's future download index. The initial observed index was 6335 bytes / SHA-256 `623bc1a37d5361de04cd0499e7dbd4f6ae47a7d32e377e47ce480d5880ceebaf`. Insert only the history link, one additional stylesheet reference, and the bounded marked history section into that live HTML. Removing those exact three insertions must recover the original HTML byte-for-byte. Add only the scoped content-addressed CSS; retain every original asset, script, manifest and package reference. Record both resulting file hashes.

Use the already configured cloud SSH identity without exposing key material. The updater signing identity is not used for static website access. Acquire nonblocking exclusive locks `moxbots-cloud-model-center.lock`, `moxbots-login-ux.lock`, `moxbots-nginx-deploy.lock`, and `moxbots-website-release.lock` under `/run/lock`. A busy lock or changed source pointer/index stops publication.

Back up the old index and target link in a private task directory. Copy the current tree into a new immutable release, preserve symlinks and existing files, verify every original file except the intentional index insertion remains identical, then atomically replace `current` after a fresh pointer/index CAS check. Do not reload Nginx or restart services. Compare Nginx configuration and cloud service PID before/after. Retain the old tree and a rollback script that only switches back if the current pointer is still owned by this release, under the same four locks.

After publication check normal TLS page/CSS hashes, original manifest/script hashes, unchanged updater manifest, and the real download→history→version anchor→download navigation on desktop and narrow screens. Keep exact private receipts and original failure logs. If checks fail, retain evidence and selectively roll back only this owned pointer; never overwrite a later website release.

Private operational evidence lives in the project pointer `work/release-notes-001-20261018/`; it is not a substitute for the main Git record. Live acceptance is recorded below; final metadata Git refs are held in the private receipt.

## Public-route failure and corrected form

The first immutable overlay passed filesystem/inventory checks but actual public navigation returned 404 for `/download/changelog.html`. The existing Nginx allowlist permits `/download/`, `download.<hash>.css/js` and `releases.<hash>.json`; it does not serve arbitrary HTML. The old pointer was restored by the audited owned rollback under all four locks, with original failure receipts preserved. No Nginx/config/service/updater change was made.

The corrected form embeds the same seven-version section in the existing download page and links directly with `#release-history`. The additional CSS name matches the already deployed allowlist. Version anchors and the `#main` return work without JavaScript. Root actual IAB checked desktop/320/390px, seven versions, 0.5.7 main/backup wording, version navigation and return to the unchanged 0.5.6 manual card. This replaces the unsupported standalone page, not its acceptance evidence.

## Final publication receipt — 2026-10-18

Live direct link: **https://140.143.183.232/download/#release-history**. The existing download page now has “查看更新记录”. Website source is `1bf1a4896c49179ad87504ceab11ac812efac92d`; normal PR135/source CI and main containment were verified. Concurrent main PR132 pin order and PR134 network fixes were preserved; the actual normal merge tree equaled the read-only prospective tree `dc26964b003e44c019ac22aa4a3b68523491d40c`. Those app changes do not enter frozen 0.5.11 or this static artifact.

The accepted immutable website pointer is `releases/history-inline-20261018-1bf1a4896c49`. Private backup/owned rollback remains `/root/moxbots-release-notes-001-20261018-v2`. Both files were read back through actual normal browser navigation/Network.getResponseBody:

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| `/download/index.html` (public `/download/`) | 13035 | `3a776dcef1162ad4d1af0e0dfd7ae614b3317b6d85aef9a6494b48e6da83944f` |
| `/download/download.ee1e5c881c12.css` | 3618 | `ee1e5c881c12277badc0d7885780d4758e944722a2bc99ee9484e1ae4868f694` |

Index, new CSS and original manual manifest were HTTP200 with browser securityState=secure. Original loader cache body matched its unchanged hash; its response securityState was unknown, so this is not claimed as a new TLS transfer. The 469-byte original manual manifest SHA remained `98f42775b3e8ab59a38ec56591bba57a9e6f8dacc3d067e4ce88aa811015c08e`; original 3974-byte loader SHA remained `13af458f2eb624154dc073d9d4779f1e8e86601339f2ddb135c17312687f48ec`.

All28 original entries except the intentionally extended index were preserved. Nginx configuration SHA `5c3e4f1c35e225b94351deb185dcb1df22136f95573d8eb14a27dab31ef2b871`, cloud PID2216644 and updater stable SHA `ee5d8b48a2a625cf29622440f11e9f05c01ecac59039e667ab63f2cd72117128` stayed unchanged. Nginx was not reloaded. No installer, desktop, account, Host or Keychain operation occurred.

Root actual public download→history→0.5.7 (including main/backup default-off wording)→download returned the original enabled0.5.6 card. Public CSS was applied; client/scroll widths matched1265/1265 (1280viewport),305/305 (320),375/375 (390). Temporary browser developer/network/viewport settings were restored. Independent prepublication review covered saved actual screenshots, content/source and scripts; Root verified the public raw bodies and replayed interactions. Independent postpublication review was unavailable because of the account usage limit, so it is not claimed as passed. The initial unsupported-path404 and audited owned rollback remain preserved rather than counted as acceptance.

Exact raw originals, public screenshots, script/fixture reviews and final receipt are in the private project pointer `work/release-notes-001-20261018/`. This closeout changes records only; final Git refs are verified externally to avoid a self-referential commit hash.
