# iOS native owner acceptance

Run the original Swift `SecureRecords`, `NativeConnection` and `NativeAttachments` with the shipping Release Rust framework inside a separate simulator-only XCTest host. No product implementation is copied or replaced. The host uses its own app identifier and every test uses a unique Keychain service and attachment scope; cleanup never targets the daily app.

Requires macOS, full Xcode, an already booted **dedicated** arm64 simulator, and the existing CocoaPods `xcodeproj` Ruby dependency. The runner locates Homebrew Ruby/CocoaPods; explicit `MOX_MOBILE_RUBY` and `MOX_MOBILE_GEM_HOME` overrides support another existing installation. It installs/runs only the test host on the named simulator through XCTest. It does not boot/shut down devices or change accounts/settings.

Build `MoxConnectionCore.xcframework` using `node mobile/scripts/build-native.mjs ios`. An existing framework is reusable only when its actual library hash, original native source digest, clean source stamp and source ancestry all match. Then run:

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer node mobile/scripts/test-ios-native.mjs \
  "$TASK_SIMULATOR_UUID" "$TASK_XCFRAMEWORK_PATH"
```

Default result must be exactly three passes and only the real-service test skipped. This mode never starts network login. An ambient live-origin environment variable cannot enable it.

For an explicitly authorized real-service start/cancel probe, pass a third positional argument containing the bare HTTPS origin. The original SDK starts one anonymous PKCE transaction and cancels it using its original `account.logout` path; it never polls/completes SSO, enrolls a device, grants a Bot or executes a model. Cleanup attempts original logout even after an assertion failure. No full authorization response, URL, verifier or token is logged. This mode requires all four named cases to pass, with no skips.

The runner retains a private temporary output directory, xcresult, strict summary/case readback and provenance. Acceptance requires process success, all expected individual case names/statuses, exact pass/skip/failure counts and unchanged Rust plus Swift/harness source hashes. It fails on zero/all-skipped/missing/duplicate cases or source drift.

Coverage: native Swift → C ABI and unauthenticated rejection; actual iOS Keychain persistence/isolation/256KiB boundary/oversize atomicity/AfterFirstUnlockThisDeviceOnly/non-synchronization; real ImageIO PNG validation; native attachment index recovery, scope isolation and 24KiB/24KiB/137-byte reads with exact reassembly and end-offset denial. It does **not** prove picker/preview UI, physical-device lock behavior, backup migration, completed login/Host execution, notifications, microphone, speech or daily-use acceptance.

Current evidence: `dev-docs/mobile-002/ios-native-runtime.md`.
