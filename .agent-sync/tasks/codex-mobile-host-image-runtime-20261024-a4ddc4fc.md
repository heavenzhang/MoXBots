<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/mobile-host-image-runtime-20261024 -->
<!-- git-project-sync-task:base=fda7728fa11ee0b1138e9357b2b81e680f408043 -->
<!-- git-project-sync-task:status=in-progress -->

# Task: MOXBOTS-HOST-IMAGE-RUNTIME-20261024: package the locked Host image runtime and verify PNG processing

## Objective

Parent MOXBOTS-MOBILE-TESTFLIGHT-20261022: real App photo upload reached the dedicated reviewer Host byte-for-byte and received accepted, but native image processing omitted it because the Host archive lacked sharp-runtime. Close that packaging gap without changing image/session policy, dependencies, IPA4, daily Mac or original 101 identity/configuration.

## Acceptance criteria / To Do

- [x] Verify canonical Git destination, clean fda7728f base and isolated task worktree.
- [x] Reuse the original Linux x64 locked resource preparer; include independent regular-file projection in both Host profiles.
- [x] Test target selection, symlink materialization/cache independence, fail-closed missing payload, native PNG encode/decode/resize and existing worker boot/resource-cache regressions.
- [ ] Non-implementer source review; original sole CI/main owner runs exact candidate CI and normal main integration.
- [ ] Real Linux packaged and installed PNG smoke on exact candidate.
- [ ] Dedicated reviewer runtime deployment with fresh scope/backup/idle/lifecycle review, then actual D2 image/artifact UI acceptance.
- [ ] Parent Apple BetaReview and actually installable TestFlight invitation.

## Completed / implementation

`build.mjs` prepares sharp via the existing exact-lock helper before release inventory. Host-specific regular-file projection expands only in-root symlinks, rejects escapes/cycles/special files, and never reuses cache inodes. The original installer remains strict. A no-network/no-Session native smoke runs with bundled Node on Linux builds and again on the actual installed path in existing disposable systemd acceptance.

## Verification

Node 24.20.0 local: `node --test scripts/host/build.test.mjs scripts/host/install.test.mjs scripts/host/bootstrap.test.mjs scripts/npm-runtime-cache.test.mjs` passed 48 tests, including the existing real worker boot/persistence/shutdown. Native PNG smoke here is macOS arm64, not Linux x64 execution. First test run exposed a symlink still surviving cpSync in the available Node 24.20.0; the regular-file projection now uses explicit exclusive file copies and that regression passes. Independent pre-review caught that the structural fake ELF fixture would be dlopen-ed on Linux; the fixture now explicitly injects only header validation, while production retains the original real validator. The canonical Linux x64 preparer also completed locally (123 files/35,105,975 bytes; target headers validated). Its 31-package derived lock retains SHA-256 aa2e2478e9931331011c05e529280d99de8401ed85769c93d6ce2522bcdb11b0, matching original d4 without a dependency/version change. Python/JS syntax and diff whitespace pass. No shared CI, formal build or live mutation has run for this subtask.

## Ownership and remaining boundaries

Canonical URL https://github.com/heavenzhang/MoXBots.git. Shared combined CI/main/desktop publisher remains 01a12bc2-907a-7702-b6dd-788225c5dfe4. Original mobile/private reviewer Host/Apple owner remains 01a12b99-7b38-78b1-831f-9c60257d386a. Independent coordinator/reviewer 01a1488b-c673-79f1-abd5-018938f2ee92. Source and exact Linux CI/main handoff precede any reviewer runtime artifact selection; current d4 running JS/Node/SDK and IPA4 remain unchanged. Missing sharp was cached by the existing worker, so copying resources alone is insufficient; any normal idle worker release must receive its own reviewed lifecycle execution, preserving the current Session and newly accepted image/receipt. Supplier modifications are still unbound/offline and separately gated.

## Next step

Send exact task diff and local evidence to the independent reviewer, then commit/push the scoped result for the original sole CI/main owner. Do not start another CI or deploy from this development worktree.
