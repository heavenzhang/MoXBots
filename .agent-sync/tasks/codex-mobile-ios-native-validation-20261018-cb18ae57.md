<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/mobile-ios-native-validation-20261018 -->
<!-- git-project-sync-task:base=3c95c51ed74b5da44093d74a9b3cf4a965a4e3ef -->
<!-- git-project-sync-task:status=in-progress -->

# Task: MOXBOTS-MOBILE-002 iOS native simulator validation

## Objective

Continue MOXBOTS-MOBILE-002 without shrinking its everyday-use objective: add missing actual iOS native SDK/Keychain/attachment acceptance while the Mac is locked. User-authorized original Host/session architecture and Git destination remain unchanged. No product executor, account, permissions or deployment changes.

## Acceptance criteria

- [x] Run original Swift owners plus source-verified Release Rust on dedicated iOS simulator.
- [x] Verify actual Keychain isolation/protection/persistence and attachment ImageIO/index/multichunk behavior.
- [x] Verify default offline3pass/onlylive skipped; explicit deployed-service start/cancel4pass with strict xcresult readback.
- [x] Independent review, repair and primary acceptance; preserve initial host failure.
- [ ] Commit/push, normal current-main/CI integration and remote proof.
- [ ] Full original goal: native UI/physical phones/signing/real SSO+Host/push/ASR/internal trial acceptance; separate and still open.

## Completed

- Added separate test host/project and deterministic runner; references original product Swift files directly. No production source modified.
- Fixed new host's SDK27 Scene requirement. Added exact Swift/harness hashes, required case/count/status checks and49,289-byte three-block test after independent review.
- Actual primary results and failure locations: `dev-docs/mobile-002/ios-native-runtime.md`. Readme contains tool dependencies, no-network default and explicit HTTPS probe scope.

## Verification

- `node mobile/scripts/test-ios-native.mjs <dedicatedUUID> <verifiedXCFramework>`: process0,3pass/1live skip.
- Same command plus explicitly authorized bare HTTPS service origin: process0,4pass/0skip. Both Rust and compiled Swift/harness source unchanged; actual xcresult case names/counts verified.
- Targeted ESLint, Node/Ruby syntax pass. Test execution used then-new harness files with exact hashes; compare committed bytes before final handoff rather than falsely reporting a clean tracked harness at execution time.

## Blockers and unknowns

- Mac remains locked; pending manual unlock and Apple Account local login. Firebase project/config and physical devices unavailable; no unchanged speech model download retries.
- Full goal not complete. Test host/Keychain acceptance is simulator-only and does not prove product UI, device lock/backup or real-user execution.
- Existing deployment ownership remains; no production/updater/service/model changes or external messaging.

## Next step

- Final committed-content comparison and normal CI/main delivery; then resume original real-user gates when local environment/config becomes available.
