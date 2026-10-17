<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/mobile-android-validation-20261018 -->
<!-- git-project-sync-task:base=400b746a4841bab8e4b99d8f83479fd54925c205 -->
<!-- git-project-sync-task:status=in-progress -->
<!-- git-project-sync-task:scaffold=false -->

# Task: Android native mobile remote module instrumentation validation

## Objective

Add module-scoped Android instrumentation coverage for the parent mobile SDK/native attachment work. The task branch starts at canonical `main` `400b746a4841bab8e4b99d8f83479fd54925c205`, then normally merges parent dependency commit `34e6861c86c76f972c0bfe46578db1c5d430134b` as merge commit `17aa8345`. No production source is changed in this validation branch.

## Acceptance criteria

- Use an AndroidX instrumented runner and stable Google Maven dependencies.
- Exercise the real Android Keystore secure-record owner, including roundtrip, scope separation, ciphertext secrecy for a synthetic marker, and oversize refusal without replacing the previous record.
- Exercise real JNI `NativeConnection` only for `account.status` and prove a new connection is signed out, without login or network requests.
- Exercise real `NativeAttachments` using synthetic items inserted through the Android system MediaStore: valid PNG import/hash/chunk, account-scope isolation, removal/list cleanup, and rejection of file URI, empty, >20 MiB, and non-image-as-image inputs.
- Run on the dedicated Android 36 emulator `emulator-5554` when the parent has completed the current Gradle build. Do not access user files or credentials.

## Completed

- Added `AndroidJUnitRunner` configuration and AndroidX Test stable dependencies (`runner:1.7.0`, `core:1.7.0`, `ext:junit:1.3.0`). Versions verified against Android Developers' AndroidX Test release page on 2026-10-18.
- Added four instrumentation tests backed by synthetic UUID-named data only. Positive attachment bytes are generated as a 1×1 PNG in memory; rejection test data is inserted into test-owned MediaStore Downloads rows and deleted in `finally`.
- Kept all implementation edits within the assigned module `android/build.gradle` and `android/src/androidTest/**` scope.

## Verification

- `git diff --check` passed after implementation.
- Instrumentation tests have not yet been compiled or run. Parent owns the currently active Gradle `assembleDebug`; this task must not start a concurrent Gradle invocation. Parent will run the module's connected Android instrumentation task after this branch is committed.
- The dedicated emulator is designated for later validation; no real-device microphone, speech, account, or Host behavior is claimed by these storage/JNI tests.

## Blockers and unknowns

- Android instrumentation execution awaits the parent's active Gradle build and run window. No Google login, account creation, login endpoint, or external service is used by the tests.
- The task validates only these Android native owners in an emulator; it is not physical-device or production acceptance.

## Next step

Parent should run the module's `connectedDebugAndroidTest` task against `emulator-5554` after the current `assembleDebug` finishes, then append actual command/output and any repair results here.
