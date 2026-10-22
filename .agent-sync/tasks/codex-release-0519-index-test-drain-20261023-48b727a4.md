<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/release-0519-index-test-drain-20261023 -->
<!-- git-project-sync-task:base=54f09b8d17e87702a08fcd4ccb40b0289c6a97b7 -->
<!-- git-project-sync-task:status=in-progress -->
<!-- git-project-sync-task:scaffold=false -->

# Task: Isolate immediate search writer-reopen tests

## Objective

MOXBOTS-0519-INDEX-TEST-ISOLATION-20261023. Root01a12bc2-907a-7702-b6dd-788225c5dfe4 remains sole desktop/macOS/updater and combinedCI/main owner. Correct two original main-push CI39852196790 LockBusy failures without changing production code, weakening lock assertions or rebuilding frozen519.2. Exact base is normally merged PR194 main54f09b8d; PR194 original39849289844 passed9 jobs/conditional iOSskip on identical tree.

## Acceptance criteria and To Do

- [x] Preserve original main-push rawjob120081037524:1805passed/2failed/8ignored; both immediate writer-reopen failures.
- [x] Read pinned Tantivy0.22.1 FD lock and Drop implementation; reproduce inherited-child FD retention in own TempDir. Exact original CI child attribution remains unknown.
- [x] Preserve both original test bodies byte-for-byte and all live-writer/lock-exists/drop/immediate-reopen/data assertions; add only cfg(test) exact-process isolation.
- [x] Rustfmt/check and compile the actual shared helper standalone with Rust1.92.0. No daily App/Reader or local broad Rust suite.
- [ ] Original corrected exact-head CI and guarded normal merge; verify remote containment and tested/main tree.
- [ ] Root release metadata handoff records unchanged frozen519.2 producer54 and corrected-test-only main separately. App/native/local/stable gates remain pending.

## Scope and source evidence

Only two test prologues, cfg(test) module registration and a private test-process helper. A retained own child runs exactly the canonical original test once after exec, inherits stdout/stderr, and has30s bounded lifecycle cleanup. The tested index operation never gains retry, sleep, lock deletion or error suppression. A child failure still fails its parent. Production search/runtime and App build inputs remain unchanged outside cfg(test).

## Completed

Root source review, pinned library read, owned POSIX inheritance probe, exact old-body byte comparison, helper compilation and formatting. Private raw receipts under work/release-0519-20261022/owner/candidate-5192-54f09b8d/. Current source artifact519.2 already compiled normally and is not rebuilt for this test-only correction.

## Verification and boundaries

Main failure is new evidence, not an unchanged-suite rerun request. This isolation addresses cross-test process/FD interference; it does not claim the precise original child or a product search shutdown defect was identified. Corrected full CI is authoritative for actual original Tantivy bodies. No global test serialization, ignored tests, production lock bypass, credentials, native UI or business actions.

## Blockers and unknowns

Exact corrected shared CI/main remains pending. Actual signed519.2 affected native paths, fresh business/schedule/draft/backup admission and real dual-device identity/access are separate release gates. Installed/stable018 and old519.1 remain immutable.

## Deployment request

Same desktop/macOSarm64/updater owner Root01a12bc2; test-only correction needs shared CI/main, no new App/Host/mobile/backend deployment or build number. Frozen519.2 uses source54/real Tauri build overlay519.2; no source/tag identity substitution. Later release tag must bind its producer/artifact honestly and record test-only main relation.

## Next step

Push exact correction once, collect original PR CI, then normal protected merge only after required jobs pass. Preserve failed main39852196790 and do not rerun it unchanged. Continue existing static519.2 signing/notary/archive steps once, without overlapping original controls.
