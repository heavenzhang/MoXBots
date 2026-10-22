<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/host-mobile-model-choices-20261023 -->
<!-- git-project-sync-task:base=5eb2ebc87489b92e250338026e2b971346ed9e15 -->
<!-- git-project-sync-task:status=in-progress -->
<!-- git-project-sync-task:scaffold=false -->

# Task: Restore credential-free Host mobile model choices before TestFlight review

## Objective

Task `MOXBOTS-REVIEW-HOST-MODEL-CHOICES-20261023`, parent `MOXBOTS-MOBILE-TESTFLIGHT-20261022`: restore original Host model choices for new and frozen mobile Sessions. Real isolated reviewer App reproduced `REMOTE_MOBILE_MODELS_UNAVAILABLE`: supervisor menu resolution incorrectly materialized a worker-only credential reference.

Scope: shared Node provider/workspace history projection and IM menu/application boundaries. No mobile/native wire change, credential guard relaxation, fake models, original 101 identity/config mutation, or daily Mac client operation.

## Acceptance criteria and To Do

- [x] Real-config regression reproduces both new/frozen menu HTTP409 on original source (RED).
- [x] Catalog/history reads return only ProviderHistoryEnv metadata without resolving worker credentials; execution resolver remains strict.
- [x] Preserve workspace/canonical-route precedence, global disable, subscription/runtime gates, per-model endpoints and reserved cloud-session namespace.
- [x] Actual model application materializes credentials after binding/observation/availability checks and before snapshot persistence; failure writes/applies nothing.
- [x] Local typecheck, lint and affected regression suite complete; exact evidence below.
- [ ] Independent source review, then hand off exact commit to existing desktop combined CI/main owner.
- [ ] Combined CI, main merge and remote-SHA verification by designated owner.
- [ ] Deploy only verified Node payload to dedicated reviewer Host, retaining its device/config; actual App menu/new/send/continue/history/file/image acceptance, then Apple external review.

## Completed

Code uses one provider definition/model/subscription resolver with execution/history purposes, one workspace route/legacy resolution path with typed projection, and an explicit catalog configured-reference check. No supervisor credential snapshot is installed or widened. IM menus and birth planning use history only. Actual apply resolves the compiled new snapshot's execution environment before the writer.

## Verification

Base `5eb2ebc87489b92e250338026e2b971346ed9e15`. Node24.21.0. Dependency entries in package-lock equal the existing trusted layout worktree (root version differs); ignored node_modules symlink reused, no install/lock rewrite.

- RED: new/frozen real config route tests, 2 expected failures409→200; retained private `model-menu-regression-red.log`.
- Local round3: 8 files /61 tests passed, including strict credential guard, actual Host menus, canonical/legacy/disable, concrete per-model transport, reserved cloud credentials, IM CAS/binding and no-write failure behavior.
- Final affected suite: 21 files /147 tests PASS (10.65s), after independent-review revision2. TypeScript --noEmit PASS; scoped ESLint --max-warnings=0 PASS; test classification PASS (451 server tests,129 integration,6 credentialed). Final logs model-menu-regressions-review2.log, model-menu-typecheck-review2.log and model-menu-eslint-review2.log; type/lint logs empty and commands exit0. Exact file/log hashes retained in model-menu-review2-candidate.json. Independent review caught a broad subscription exemption; two extra managed-transport tests reproduce RED against that prior condition and pass GREEN after using existing sdk-native auth policy. Managed OAuth/proxy missing env now rejects before all writes, while SDK-native/Codex legitimate no-env behavior remains.

Evidence lives under project pointer `output/mobile-testflight-20261022/reviewer-demo-host/` (private, no runtime secrets in Git).

## Ownership, blockers and unknowns

Repository: https://github.com/heavenzhang/MoXBots.git. Branch `codex/host-mobile-model-choices-20261023`.
Development + dedicated mobile reviewer Host owner: this chat `01a12b99-7b38-78b1-831f-9c60257d386a`.
Combined CI/main owner remains `01a12bc2-907a-7702-b6dd-788225c5dfe4`; no independent push/CI/PR by this development task. Reviewer `01a1488b-c673-79f1-abd5-018938f2ee92` may read exact source/evidence, not runtime secrets/production writes.

Native GUI lease explicitly returned to desktop owner. No further simulator action before explicit handback. Formal IPA4 remains immutable producer63 / SHA ecd4be46664a4416e30a8d9253831a4f92b1015c45ab65d4f7deb9d060bb9b11; new Host payload will have its own source/digest receipt. App chat/file paths and external TestFlight review are not yet accepted; original iPhone business path, voice and APNs remain deferred.

## Next step

Read final local logs, resolve any failures, obtain bounded independent source review and commit this task's files; hand exact SHA/evidence to existing desktop owner for one combined CI/main integration. Do not replay earlier reviewer stage/auth/grant operations or update original101.
