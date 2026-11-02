<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/recovery-phase19-integration-20261103 -->
<!-- git-project-sync-task:base=3dc40bbcf4a3e999372789f7a0f84f0d2e437c00 -->
<!-- git-project-sync-task:status=in-progress -->

# RECOVERY-PHASE19-RELEASE-0539-20261103

## Objective

Deliver the reviewed Phase19 connection-establishment recovery through the existing desktop release owner 01a12bc2. Reserve desktop 0.5.39/build539.1; do not reuse installed 0.5.38/538.1 or stable0.5.36 artifacts. Original producer cc79015f is preserved and the integration retains its eleven changed blobs.

## Acceptance and current state

- [x] Scoped independent source review and three focused files / 49 tests pass on original and integrated code.
- [x] Clean isolated integration onto actual main3dc40bbc; producer independently read back byte equality.
- [x] Eight manifest/lock files updated consistently; three version contract tests pass.
- [ ] Synchronize actual main after the already active Host fix PR242 and resolve candidate membership before freeze. Host deployment remains separate.
- [ ] Exact-source CI, applicable independent ARM admission, verified remote main and immutable version/tag/artifact.
- [ ] Once-only formal build/sign/notary/archive, normal maintenance backup/rollback and installation by desktop owner.
- [ ] Bounded original-session validation with fresh execution identities; preserve completed/unknown actions, histories and user work. The October31 16:07Z UI pause was revoked by the direct October31 16:30Z reply authorizing original publisher installation and verification, with later November1 confirmations. Continue normal authorized maintenance, fresh activity checks and backup; do not treat that old pause as current.

## Next step

Finish current shared CI/Main Host fix, reconcile latest main, freeze one exact 539.1 candidate and run its source checks once. Do not use preceding source results as new-candidate CI. Signing, installation, real Provider recovery and stable promotion remain separate gates.

## Search lifecycle fixture follow-up

The Host-main full Rust run41510515314 observed a writer LockBusy at the V2 startup test's immediate same-process drop/reopen. Current539 exact Rust run passed; the earlier failure remains preserved. Existing search/test_process.rs already isolates identical writer lifecycle tests from concurrent libtest process spawns, which can inherit the flock descriptor until exec. Apply that existing exact-child entry to this omitted V2 test, with the entire original assertion body unchanged. No production index code, lock removal, retry, sleep, timeout or ignore policy changes. Review and test the new source before updating the candidate; old-source CI does not become new-source evidence.
