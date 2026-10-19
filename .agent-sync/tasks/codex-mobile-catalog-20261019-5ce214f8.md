<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/mobile-catalog-20261019 -->
<!-- git-project-sync-task:base=0f9a031a3e9ff5ac83f2db552c179d3183518759 -->
<!-- git-project-sync-task:status=in-progress -->

# Task: MOXBOTS-MOBILE-CATALOG-001: preserve usable Bots when another device directory is unavailable

## Objective

Continue MOXBOTS-MOBILE-002 from an actual native iOS simulator QA login. Original password authentication, process-restart Keychain recovery and logout succeeded against the existing production service929b984e. The subsequent Bot directory failed with CATALOG_STALE; the signed-out form also retained that old directory error. Physical human-admin iPhone acceptance remains unproven.

Keep the original mobile Rust/Swift/C ABI/React Native owners, cloud identity, Host and Session. Correct per-device directory availability and account-scoped error projection. No cloud security relaxation, new execution owner, device deletion, Host restart or model invocation. Source ownership: bounded mobile implementation worker; primary owns records, review, tests/native acceptance, Git/main and release handoff. Cloud writes remain with designated owner01a12b99-7b38-78b1-831f-9c60257d386a.

## Acceptance criteria

- [x] Confirm user-supplied Git URL, latest clean main0f9a031a3, isolated branch and observe/start/task-init gates.
- [x] Reproduce actual native login/restart/logout and isolate subsequent directory failure; verify only this QA device/session changed.
- [ ] Mixed Ready and offline/syncing devices display validated available Bots; unavailable peers cannot make the whole directory fail.
- [ ] Target-specific stale races remain unavailable; auth, permission, schema and transport failures remain genuine failures. Preserve scope/epoch/selection authority checks.
- [ ] Strict paired native projection discloses unavailable directory state separately from pagination; preserve a compact session-centered UI.
- [ ] Successful logout/account changes clear old-account transient errors, including late asynchronous results; real logout/login errors remain visible.
- [ ] Meaningful Rust/runtime and app regressions, type/lint and primary diff review pass.
- [ ] Rebuild matching native/JS inputs, repeat controlled real native QA login/list/restart/logout and verify the original Host/device boundary.
- [ ] Commit/push, exact-head CI, normal remote-main integration and remote ancestry verification.
- [ ] Physical iPhone and Android daily-use/attachments/voice/push acceptance remain tracked by the full original goal, not closed by this repair.

## Completed

- The base source has been inspected and a real native failure reproduced. Product repair is in progress; no implementation or final acceptance is claimed.
- APNs scope preparation was separately delivered by PR155, mainaaed91342619e67bb45a9639ef9e6ae373b73da4 after all applicable PR checks passed. That is source delivery, not provider activation or physical push acceptance.

## Verification

Dedicated simulator source8e902d6a matches the installed physical-phone candidate's product inputs. Original signed Release app with embedded JS, original Swift/C ABI and exact simulator Rust library passed strict signature/source-byte checks. Through Device Hub: native fields editable, consent initially unchecked, submit disabled until explicit consent; password login entered the actual authenticated app without a browser, password/consent cleared on submit; terminate/relaunch restored login; settings logout returned to an empty unchecked form. Bot list and post-logout error projection failed with CATALOG_STALE.

Cloud owner's private read-only before/after receipts prove only one test device added, no removals, the test session revoked after logout, and original101 authority/key/membership/Ready/catalog alignment unchanged. The inactive QA device record is retained; no SQL cleanup. Private runtime evidence is outside Git under the WPS project output/mobile-002/native-checkpoints/simulator-live-login-8e902d6a/ and the publisher's simulator-live-login-8e902d6a-* receipts. Credentials were read only in memory; no password/token in these project records.

Source diagnosis: metadata-core agent_rows requires target presence=ready and matching connected/catalog epoch. It does not use catalog wall-clock age in this check. Mobile list_targets queries every same-account joined peer and propagates any Agents error. The observed roster has four historical joined offline peers plus the valid Ready Host; their expected stale result can abort the usable list. Do not restart the Host or weaken server rules to hide the client error.

Requested worker model gpt-6-luna/medium; exact runtime model/usage/cost unknown. One bounded mobile implementation worker; primary retains UI/runtime and integration acceptance. No external models.

## Blockers and unknowns

Physical iPhone is unavailable to devicectl and the human has not supplied a new actual login result. The simulator QA user is a controlled account, not the human admin. Existing APNs key path is unresolved; production notification configuration is absent; user has no existing Firebase project. Actual attachments, Chinese voice and background delivery remain open. Production service remains the publisher's accepted929b984e until a separately verified release window; this work does not operate cloud/101/daily Mac.

## Next step

Finish bounded mobile source repair and focused regressions, then primary review and exact native rebuild/UI retest. Incorporate the current remote main deliberately before final integration; do not overwrite the preserved8e902d6a candidate or bypass CI.
