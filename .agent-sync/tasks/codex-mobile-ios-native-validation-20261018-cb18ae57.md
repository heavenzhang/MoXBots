<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/mobile-ios-native-validation-20261018 -->
<!-- git-project-sync-task:base=3c95c51ed74b5da44093d74a9b3cf4a965a4e3ef -->
<!-- git-project-sync-task:status=in-progress -->

# Task: MOXBOTS-MOBILE-002 iOS native simulator validation

## Objective

Continue MOXBOTS-MOBILE-002 without shrinking its everyday-use objective: add missing actual iOS native SDK/Keychain/attachment acceptance while the Mac is locked. User-authorized original Host/session architecture and Git destination remain unchanged. No product executor, account, permissions or deployment changes. The integration also contains a test-only desktop Host lifecycle regression after combined CI failed; product Host source remains unchanged.

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

## Integration checkpoint

Original test/evidence commit full Test39090821185 passed. Latest main8ed2b4e1b74b25cc4e5533119aa66cf3eb335809 normally merged, preserving its manual Windows release cache and all handoff records; original phone/native/test inputs unchanged. Final combined CI/main proof remains open; no production action. Project map and overall plan now route to actual iOS runtime evidence instead of older build-only status.

## Next step

- Final committed-content comparison and normal CI/main delivery; then resume original real-user gates when local environment/config becomes available.

## Combined CI diagnostic and concurrent main

- Normally absorbed main149f5edfbe3fd66fe98e21a01bff13c58ca0d691 goal icon changes and task records without conflicts.
- Test39092169100: frontend DOM failed the existing StrictMode Host status-refresh case; six other normal jobs passed. Original isolated file15pass and ten runs of the original case passed. Original CI trigger remains unknown.
- Profiler commit-reentry experiment exposed an aborted signal but is not a real browser-click reproduction. Independent review rejected using it as proof of a production defect; all experimental product changes withdrawn.
- Fixture mount now explicitly awaits inspect and StrictMode effects in async act. Added independent deferred requests proving active result publication, live signal, real unmount abort and stale-result isolation; second request count and distinct deferred explicitly checked after review.
- Primary focused file16pass; full DOM/typecheck/final combined CI pending. No timeout/retry/skip relaxation. Diagnostic logs retained at /tmp/moxbots-mobile-host-lifecycle-*.log and original failure /tmp/moxbots-mobile-ios-native-final-ci-failure.log.
- Selection: reuse one independent reviewer for bounded lifecycle diagnosis; no new worker. Existing requested gpt-6.1-sol/medium due cross-lifecycle uncertainty, runtime routing/cost unknown. Native-only ai-yaoren-local; no external model call.

## Host renewal main integration

Main advanced to dcf8d9a60976c160e2b2aca33313c668c071132c (PR119). Normal merge has no conflicts. Its original Host renewal changes include shared Rust native provenance inputs, so02c2 packages and runtime acceptance are retained as historical source-bound evidence rather than called current. No original mobile owner is replaced.

Primary local original300-file DOM run:299 files/2548 cases pass, one unrelated Settings browser-resource focus case fails (139.84s); original Host case and new lifecycle case pass. Failure log /tmp/moxbots-mobile-ios-native-full-dom.log retained. Typecheck and focused ESLint pass. Settings focused diagnosis and merged-source full regression remain pending; no pass inferred from isolated checks.
