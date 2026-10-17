<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/mobile-artifact-native-20261018 -->
<!-- git-project-sync-task:base=400b746a4841bab8e4b99d8f83479fd54925c205 -->
<!-- git-project-sync-task:status=in-progress -->
<!-- git-project-sync-task:scaffold=false -->

# Task: Native mobile artifact download and verified local preview

## Objective

Add native-only mobile artifact listing, verified download, local cache lifecycle, and operating-system preview/share for Android and iOS. Keep app JavaScript limited to strict descriptors and opaque state; use the existing NativeConnection assets owner and current approved target/session authority. No deployment, credentials, account changes, or user-file access.

This task starts from canonical main `400b746a4841bab8e4b99d8f83479fd54925c205`. Native mobile foundations and app upload handling are brought in as an ordinary dependency merge from parent integration `8e38f61984bc4d9e027f0b10b0cdea3c2e97dc44`; root will cherry-pick only this task's implementation commit(s), not the dependency merge.

## Acceptance criteria

- Closed v1 intents: `artifact.list`, `artifact.download`, local/query-only `artifact.status`, `artifact.pause`, `artifact.remove`, and native `artifact.preview`/`artifact.share`.
- Remote access uses only existing `assets.list` and `assets.read`; no new remote status protocol. Status never advances downloads. Explicit download/resume revalidates the exact descriptor and current approved target, then validates each read offset, per-chunk digest, final length, and whole-file SHA-256.
- Durable account-scoped metadata and private cache are verified before remote effects. Cache identity is account scope + stable identityKey + sessionId + artifactId; targetId is current approved routing data only. Enforce 20 MiB per artifact, 200 MiB per account, and at most 10 cached artifacts per target.
- Metadata-only `artifact-download` projections/events carry current targetId, identityKey, agentId, sessionId, artifactId, descriptor name/mimeType/sha256, state, receivedBytes, totalBytes, and errorCode. Never return file path, URI, bytes, or base64 to JS.
- Pause, background, account/target change, and destruction fence subsequent owner turns and late callbacks. Preview/share/remove use only complete hash-verified files; Android uses a scoped FileProvider read grant, iOS uses QuickLook/native share UI. No caller-controlled paths or arbitrary URL schemes.
- Add deterministic injected state-machine/storage tests for strict schema and scope, bounded reads, integrity mismatch, resume/status/pause, quota, and OS presenter gating. Do not run Gradle concurrently with root's serial build.

## Completed

- Verified project-sync observe at `e04eadd686e05f6a79fad47289e0e66ced7eec4f`; canonical `main` remains `400b746a4841bab8e4b99d8f83479fd54925c205`.
- Created this isolated task branch from canonical main and passed `start` and `task-init` gates.
- Merged the already reviewed parent dependency `8e38f61984bc4d9e027f0b10b0cdea3c2e97dc44` normally; it descends from the recorded canonical base. Artifact implementation is in progress; no artifact behavior has been verified yet.
- Parent inspected the production APK and found the module's imported Rust connection library was packaged only into the instrumentation APK. Added the same native-library source directory to the production `main` source set while preserving androidTest packaging. Awaiting parent serial APK/instrumentation verification.
- Artifact download/cache/presenter implementation is in progress in this branch and is not part of the focused JNI packaging repair commit.

## Verification

- Android compilation/instrumentation is owned by the root serial Gradle window and has not been run by this task.
- The production JNI packaging change has not yet been rebuilt; parent owns the APK contents, native dependency, alignment, SHA, and instrumented regression checks.
- iOS compilation requires Xcode license state; this task will not accept any license. Source-level checks are not a substitute for iOS compilation or device testing.
- Physical-device, real Host artifact, and user-session acceptance are outside this task unless separately assigned.

## Blockers and unknowns

- Inspect and implement against the actual `src/shared/remoteAssets.ts`, `src/server/remote-session/assets.ts`, `NativeConnection`, module owner queue, and current target approval checks before locking exact schemas.
- Android FileProvider and iOS QuickLook/share presenter implementation details depend on the existing Expo module/plugin layout and platform APIs.

## Next step

Read the committed artifact protocol and module lifecycle, then define an injectable native artifact store/scheduler and OS presenter boundary before wiring module intents/events.
