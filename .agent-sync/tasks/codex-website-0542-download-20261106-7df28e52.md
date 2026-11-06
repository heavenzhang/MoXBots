<!-- git-project-sync-task:source-digest=22ffbff9a469104cdceea18ffa912a10d9befcdb4ae2339cc8a901b57746a5b2 -->
<!-- git-project-sync-task:version=2 -->
<!-- git-project-sync-task:id=9eb9955e-d7c9-41a6-b8a7-c4fb46300f41 -->
<!-- git-project-sync-task:branch=codex/website-0542-download-20261106 -->
<!-- git-project-sync-task:base=045b30eef4caf827249934539b6d0197674266b4 -->
<!-- git-project-sync-task:status=in-progress -->

# WEB-DOWNLOAD-0542-5426 · 0.5.42 website download

## Objective

Publish the exact existing signed and notarized 0.5.42/build 542.6 archive through the 101 website. Website owner is 01a12b99-7b38-78b1-831f-9c60257d386a; shared CI/main/desktop/updater owner is 01a12bc2-907a-7702-b6dd-788225c5dfe4. Preserve updater, Nginx, cloud, Host, daily Mac, and mobile state.

## Acceptance criteria

- [x] Admit original complete normal-TLS public GET, exact size/SHA, and production signature proof.
- [x] Update scoped source projection, immutable manifest, page/history, release notes, documentation, and deterministic tests.
- [x] 23 website render/fail-closed tests pass.
- [ ] Publish minimal static overlay with fresh baseline, existing nonblocking locks, backup, ownership-checked rollback, and CAS.
- [ ] Verify live HTML, manifest, notes, links, version, size, SHA, and finite route/browser regressions.
- [ ] Commit/push scoped source, hand exact SHA to shared CI/main owner, and verify remote main.

## Completed

Source projection points to the immutable archive of 302337663 bytes and SHA-256 5e6724a0dc672f0cead5a86553e7ff9e714f1423298ab57258ec28232f9046d1. Producer source is 34fe85d41660b361232015c54e33ef4bfffa1d57. Old 0.5.36 static files remain. Fresh production site inventory was captured before deployment.

## Verification

- Source digest: `22ffbff9a469104cdceea18ffa912a10d9befcdb4ae2339cc8a901b57746a5b2`; node --test services/website/download.test.mjs: 23 passed; git diff --check: passed; original normal-TLS full GET and signature: PASS

Original full GET/signature proof: work/release-0542-r6-20261106/owner/candidate-5426-34fe85d4/publication/external-get-gates.json. `node --test services/website/download.test.mjs`: 23 PASS. `git diff --check`: PASS.

## Blockers and unknowns

No source or artifact blocker. Production overlay, public/browser checks, and shared CI/main remain pending. Website acceptance does not claim Host, mobile, paid model, or every business path.

## Next step

Commit/push scoped website source, publish exact static overlay under existing website locks and CAS, then give the shared CI/main owner the precise source commit and evidence.
