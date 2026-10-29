<!-- git-project-sync-task:version=2 -->
<!-- git-project-sync-task:id=7af614ec-813f-4d64-974d-de54589460ba -->
<!-- git-project-sync-task:branch=codex/website-latest-download-20261030 -->
<!-- git-project-sync-task:base=f072eff9a94724fc8802e939e51255dbf625ea3d -->
<!-- git-project-sync-task:status=in-progress -->
<!-- git-project-sync-task:source-digest=e27878c8679b73c7dae35e861dd521099c200f852a5ce198f86fde884626df2a -->

# Task: MB-WEBSITE-LATEST-DOWNLOAD-20261030 官方下载复用已验收0.5.27原包

## Objective

MB-WEBSITE-LATEST-DOWNLOAD-20261030: offer the accepted 0.5.27/527.3 Mac archive at https://101.42.11.29/moxbots/download/; preserve layout/old files and Windows preparing. No binary rebuild, repeated full GET, updater/cloud/Host/client operation.

## Acceptance criteria

- Exact accepted artifact URL/size/hash/source/signing, TAR.GZ instructions and current history.
- Existing pointer backup, new immutable static release, ownership CAS/rollback and exact public TLS readback.
- Source pushed and Root CI/main receipt tracked separately; actual browser limitation explicit.

## Completed

- Reviewed four-file proposal and corrected obsolete history current-version claims; source projection mirror and 23 relevant checks added.
- Live 33-file inventory matches saved baseline; no server mutation yet. See dev-docs/website-latest-download-20261030.md.

## Verification

- Source digest: `e27878c8679b73c7dae35e861dd521099c200f852a5ce198f86fde884626df2a`; node --test services/website/download.test.mjs: 23 passed; git diff --check: passed; fresh read-only live baseline: all33files match. Actual browser blocked by Work setting; static publication/main pending.

- node --test services/website/download.test.mjs: 23 passed.
- git diff --check: passed.
- Read-only live snapshot: 33 files, original pointer/config/identity fingerprints saved privately.

## Blockers and unknowns

- Work local-browser setting disables IAB; actual desktop/mobile screenshots not performed.
- Shared CI/main are Root-owned and pending; no new PR or manual shared-CI trigger here.

## Deployment request

- Required: website static unit at101/moxbots/download, independently owned here (01a12b99-7b38-78b1-831f-9c60257d386a), along original human authorization and latest owner handoff.
- Shared CI/main/artifact/updater owner:01a12bc2-907a-7702-b6dd-788225c5dfe4. Exact branch/head and result are handed off privately, not a second CI or PR.
- Cross-unit dependency: reuse the already published0.5.27 immutable artifact; no protocol/config/data migration, no new public port, no other unit release. Keep original pointer for selective rollback.
- Status: local checks passed; source push, static publication/readback and Root main receipt tracked separately in the acceptance document. Actual visual acceptance blocked by browser setting.

## Next step

- Save reviewed source, then publish the four-file overlay using the original lock/backup/CAS contract; persist exact live and Root main handoff receipts.
