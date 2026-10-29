# MB-WEBSITE-LATEST-DOWNLOAD-20261030

The existing 101 website owner publishes the already accepted macOS 0.5.27 / build 527.3 TAR.GZ. Producer `c2473e28acf2c257508dc8ad705731138441c7c2`, tag `v0.5.27`, release main `4977779c196ab96e950cc3eb307ae584bef1b72b`; artifact size 301917219 bytes and SHA-256 `93f68bc62ee73fe75517f29023281a5037a7b262b51615a4fa20616d42f592c1`. Apple notarization, production signature and a complete anonymous normal-TLS GET were accepted by the original artifact owner; this lane reads those receipts and verifies the current public HEAD, without another large GET. Windows remains preparing.

- [x] Isolated branch from current main `f072eff9a94724fc8802e939e51255dbf625ea3d`; no earlier migration source carried over.
- [x] Four-file overlay reviewed; older current-version history claims corrected. Exact-byte source projection mirrors the hashed manifest.
- [x] 23 deterministic Node checks: identity/size/signing/source projection, unsafe or mismatched archive, notes, network/HTTP/JSON failure and retry, stale-link cleanup, clipboard fallback and prior route compatibility.
- [x] Read-only live inventory: all 33 root-owned files exactly match the retained baseline. Original release remains the rollback directory.
- [ ] Exact source commit/push and Root shared-CI/main intake.
- [ ] New immutable static directory, backup/CAS publication and normal-TLS readback.
- [ ] Protected service/config/identity and finite route regression.
- [ ] Actual browser desktop/mobile visual review: blocked by Work local-browser setting; do not substitute synthetic DOM checks or claim screenshots.

Static publication scope: `download/index.html`, `download/download.280f1e9fa500.js`, `download/releases.0620e6abba22.json`, `download/notes/0.5.27.html`. Preserve the other baseline files, Nginx/TLS/AI4S/cloud/updater/Host and daily Mac. Hold the existing cloud101/AI4S maintenance/Host-exec locks nonblocking; snapshot root-owned pointer, complete tree and protected fingerprints before publication. Verify candidate archive files and safe paths, create a new root-owned release exclusively, then CAS the existing pointer and verify exact public bytes. On failure restore the old pointer only while it still references this release. Never restore database/token/key state.

Private exact evidence and final machine-readable handoff are in the project output `work/download-latest-20261030/owner/website-owner-result.json`. The original artifact owner independently reads that file; no duplicate publisher or shared-CI dispatch is created here. Main integration remains pending until Root's remote-main receipt. Website success does not close cloud browser login, full model fault matrix, mobile business or TestFlight acceptance.
