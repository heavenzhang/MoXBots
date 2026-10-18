<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/mobile-ios-native-validation-20261018 -->
<!-- git-project-sync-task:base=3c95c51ed74b5da44093d74a9b3cf4a965a4e3ef -->
<!-- git-project-sync-task:status=in-progress -->

# Task: MOXBOTS-MOBILE-002 iOS native simulator validation

## Objective

Continue MOXBOTS-MOBILE-002 without shrinking its everyday-use objective: add actual iOS SDK/Keychain/attachment acceptance, repair simulator signing and complete visible login cancellation. User-authorized original Host/session architecture and Git destination remain unchanged. No product executor, account, permissions or deployment changes. The integration also contains a test-only desktop Host lifecycle regression after combined CI failed; product Host source remains unchanged.

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

## Native UI resumed and simulator signing diagnostic

User confirmed unlock and no existing Firebase project. CUA now accesses Xcode and the dedicated iOS27.0 Device Hub. Existing Apple account entry is visible; Teams loading is not signing/profile proof. APNs/FCM still unaccepted.

- Actual source02c2 full application launches but shows MOBILE_SECURE_STORE_UNAVAILABLE. Initial package was built with signing disabled. Keychain protection is unchanged.
- Preserved original archive. Copied App to a unique /tmp path, applied normal ad-hoc codesign and installed on the same dedicated simulator without uninstall/Keychain removal. Error still reproduced; manual resign alone is not a fix.
- Original product and manually resigned executable omit __TEXT __entitlements/__ents_der, while the accepted Xcode-native test host contains both. This supports an Xcode simulator-entitlement hypothesis, not yet a confirmed fix.
- Simulator builder now requests Xcode ad-hoc signing rather than disabling signing and verifies strict signature, ad-hoc/non-linker resource sealing and both simulator entitlement sections. It requires no Apple development identity or provisioning; it does not enable true device signing. Actual full build and same-data UI retest pending.
- Maina823 merged-source DOM301files/2564cases passed with4workers (251.61s). Earlier normal-parallel Settings focus failure retained; isolated Settings2pass. Typecheck/focused lint pass. Both updated Android/iOS Release Rust libraries built; new native runtime/package acceptance pending.

## Confirmed signing fault and cancellation repair

- Source126 Test39094018994 succeeded:9normal jobs including Ubuntu systemd, optional iOS build skipped. Actual126 iOS3/1 and4/0 runner/hash gates pass;600s post-test diagnostic collection timeout retained. Packages are source-bound; newer inputs need fresh acceptance.
- Same-source/JS/Info/data signing positive-negative-positive CUA control confirms secure-store failure with signing disabled and recovery after exact signed archive restore. No data removal. Safari original login form reached without credentials/full SSO. See new source-bound evidence and task-output screenshots.
- One reused worker implemented only3app files: explicit cancellation/signed-out confirmation, failure quarantine/retry, synchronous action mutex, stale poll/read fencing and terminal handling. Primary reviewed and independently ran typecheck/lint/policy55pass. Native cancellation lost proof on failure; original deterministic TLS503 regression fails, repair112pass/1ignored plus Clippy; worker native review passed. It is HTTP503 over real TLS, not a tested TCP disconnection. No automatic retry/new authority/frozen dependency change.
- Swift live test uses serial async queue/continuation, asserts off-main; independent review rejected sync before acceptance. Actual new compiled4cases still pending. No pending-SSO process-death persistence claim.
- Next: commit/push repair, rebuild native/app, real UI cancellation/return and final CI/main receipt. Physical/SSO/Host/push/speech/internal trial gates stay open. Apple teams query failed; Firebase explicitly absent.

- Fresh228 app build and Android offline33/1 (4.152s)/explicit2 (2.802s) succeeded. Native XCTest build failed before running cases because capturing the implicitly unwrapped fixture bundle inferred String? across the async boundary. Fixed with explicit XCTUnwrap before dispatch; failure /tmp/moxbots-mobile-228-ios-native-offline.log and result23NVGq preserved. Product code/native inputs unchanged by this fixture-only correction; fresh native execution remains required.

## Accepted current candidate / integration handoff

- Product228, fixture658; native source900f6697. Fresh original iOS3/1 and4/0 strict gates pass; explicit cases0.641s/testing phase6.040s, no repeated post-diagnostics timeout. Android33/1 (4.152s), explicit2 (2.802s); both new Release native/app builds and actual artifact gates pass. Packages55db16dd/bd95703a and private provenance/raw results in task output; source-bound summaries committed.
- Primary CUA accepted real iOS first-screen/refresh and two original start/cancel cycles, restored login action/cleared notice; second Safari handoff reached system Home, returning to still-running App recovered pending and cancel. Full SSO not accepted. Pending/cancelled screenshots retained.
- Final normal CI/main outcome is authoritative at PR121 and actual remote main; output host-integration-20261018.md and main-delivery receipt retain observed result. Source task remains in-progress for original full-goal gates. Recheck actual Git/PR status before assuming integration needs repeating.
- User real-account manual SSO choice pending. No Firebase project; Xcode team retrieval failed; no physical-phone/push/voice/internal trial acceptance or production release. No original authority or frozen dependency changes.
