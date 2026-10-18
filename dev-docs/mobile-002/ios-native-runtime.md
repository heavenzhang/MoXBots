# MOXBOTS-MOBILE-002 actual iOS native runtime

The previous full iOS build did not establish runtime or Keychain acceptance. A separate simulator XCTest host now directly compiles the three original product Swift owners and links the existing shipping Release Rust framework. No production implementation, trust policy, account or daily application is modified.

## Primary acceptance

- Dedicated simulator `8505F368-BEAD-401F-89BB-0924B67E40DA`, iPhone16e/iOS27.0, SDK27.1, arm64.
- Original Rust framework source `02c2fe419935bb48d25b9b5f81020c7dd44ac267`, clean native digest `eea5df3be892ec02695c25289ebffb4f6e3f24256589695d860bf4444f423c6c`, matching already built dual-platform packages. Current source ancestry and actual library bytes checked.
- Offline: exactly three passed, only explicit live probe skipped; process exit0, actual xcresult counts and all four case names/statuses verified. Evidence `/tmp/moxbots-mobile-ios-native-scene-offline.log`, private result directory `/var/folders/34/45h5k_sd5z134tmnzl7499n00000gn/T/moxbots-ios-native-bA81JW`.
- Explicit original Swift → Release C ABI → deployed HTTPS service: all four passed, zero skipped/failed/expected failures. PKCE start, original pending-login cancellation and signed-out projection verified; no browser SSO, enrollment, Bot grant or model execution. Evidence `/tmp/moxbots-mobile-ios-native-live.log`, result directory `/var/folders/34/45h5k_sd5z134tmnzl7499n00000gn/T/moxbots-ios-native-ZZ8We7`.
- Actual iOS Keychain round-trip/reopen, account-scope/record/service isolation, 256KiB boundary, oversize rejection preserving previous bytes, protection attribute and non-synchronization, idempotent removal and test-only cleanup passed.
- Actual ImageIO PNG admission/hash/bytes, persistent attachment index, scope isolation, invalid image rejection and a49,289-byte file read as24,576/24,576/137 bytes with exact reassembly and end-offset denial passed.
- JavaScript runner ESLint, Node syntax and Ruby syntax passed. Independent read-only review identified three evidence gaps (Swift source drift, weak result acceptance, single-chunk-only coverage); all repaired and re-reviewed. The primary verified actual live xcresult/provenance as well.

The test harness was newly added during execution; its exact source hashes and the three original Swift file hashes are retained in both provenance records. Native Rust source stayed clean. A committed-content comparison ties the accepted inputs to delivery without relabeling an old framework build or claiming the new files were already committed during the run.

## Retained failure and repair

Initial minimal test host failed before any SDK test because the SDK27 Scene lifecycle is required. Log `/tmp/moxbots-mobile-ios-native-offline.log`, result directory `moxbots-ios-native-THwHkc` retained. The exact failed task-owned xcodebuild process was interrupted/stopped; the corrected run is separately identified. [Apple's Scene lifecycle guidance](https://developer.apple.com/documentation/uikit/transitioning-to-the-uikit-scene-based-life-cycle) confirms this requirement. Added Scene configuration only to the new test host. The original Expo application already has a Scene configuration; it was not changed.

## Boundary and continuation

These are actual simulator native runtime tests, not UI automation. Mac lock still blocks CUA product-page/keyboard/picker/preview acceptance. No physical iPhone, Apple developer signing, full SSO/real Host user path, APNs/FCM/background recovery, recording/Chinese speech or internal signed distribution is accepted by these tests. Preserve those goal gates. Reproduction and narrow real-service opt-in: `mobile/tests/ios-native/README.md`.
