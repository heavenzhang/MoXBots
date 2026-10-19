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
- [x] Mixed Ready and offline/syncing devices display validated available Bots; unavailable peers cannot make the whole directory fail.
- [x] Target-specific stale races remain unavailable; auth, permission, schema and transport failures remain genuine failures. Preserve scope/epoch/selection authority checks.
- [x] Strict paired native projection discloses unavailable directory state separately from pagination; preserve a compact session-centered UI.
- [x] Successful logout/account changes clear old-account transient errors, including late asynchronous results; real logout/login errors remain visible.
- [x] Meaningful Rust/runtime and app regressions, type/lint and primary diff review pass. Shipping-profile C ABI and native UI remain separate below.
- [ ] Rebuild matching native/JS inputs, repeat controlled real native QA login/list/restart/logout and verify the original Host/device boundary.
- [ ] Commit/push, exact-head CI, normal remote-main integration and remote ancestry verification.
- [ ] Physical iPhone and Android daily-use/attachments/voice/push acceptance remain tracked by the full original goal, not closed by this repair.

## Completed

- Bounded source repair and primary review complete. Rust123/1ignored, App57, TypeScript/Expo lint and changed-file rustfmt pass. Original Direct Host/Session integration passes15.86s with one real joined offline fixture peer. Actual synthetic IAB verifies partial availability, removal of stale online targets on a genuine failure and same-process logout error cleanup. Details and known-red debug C ABI probe: dev-docs/mobile-002/catalog-20261019.md. Release C ABI and native milestones are recorded below; final main and physical acceptance remain open.
- Source4e50be4b Release native App passed actual controlled original-cloud login, legitimate empty Bot directory with5 unavailable peers, process-restart Keychain recovery and same-process clean logout. No browser, Bot enablement, model invocation or original Host change. Cloud owner's fresh before/after read-only receipts preserve original101 and show only one added QA device. Native password Done/drag usability improvement is a later UI-only change; type/lint pass, actual keyboard retest pending without submitting a new login.
- APNs scope preparation was separately delivered by PR155, mainaaed91342619e67bb45a9639ef9e6ae373b73da4 after all applicable PR checks passed. That is source delivery, not provider activation or physical push acceptance.

## Verification

Dedicated simulator source8e902d6a matches the installed physical-phone candidate's product inputs. Original signed Release app with embedded JS, original Swift/C ABI and exact simulator Rust library passed strict signature/source-byte checks. Through Device Hub: native fields editable, consent initially unchecked, submit disabled until explicit consent; password login entered the actual authenticated app without a browser, password/consent cleared on submit; terminate/relaunch restored login; settings logout returned to an empty unchecked form. Bot list and post-logout error projection failed with CATALOG_STALE.

Cloud owner's private read-only before/after receipts prove only one test device added, no removals, the test session revoked after logout, and original101 authority/key/membership/Ready/catalog alignment unchanged. The inactive QA device record is retained; no SQL cleanup. Private runtime evidence is outside Git under the WPS project output/mobile-002/native-checkpoints/simulator-live-login-8e902d6a/ and the publisher's simulator-live-login-8e902d6a-* receipts. Credentials were read only in memory; no password/token in these project records.

Source diagnosis: metadata-core agent_rows requires target presence=ready and matching connected/catalog epoch. It does not use catalog wall-clock age in this check. Mobile list_targets queries every same-account joined peer and propagates any Agents error. The observed roster has four historical joined offline peers plus the valid Ready Host; their expected stale result can abort the usable list. The current controlled-QA Host has one disabled Bot and no enabled target; a legal empty directory must remain empty. Enabled-target preservation must be verified by the isolated original-protocol fixture; do not enable a production Bot for a screenshot. Do not restart the Host or weaken server rules to hide the client error.

Requested worker model gpt-6-luna/medium; exact runtime model/usage/cost unknown. One bounded mobile implementation worker; primary retains UI/runtime and integration acceptance. No external models.

## Blockers and unknowns

Physical iPhone is unavailable to devicectl and the human has not supplied a new actual login result. The simulator QA user is a controlled account, not the human admin. Existing APNs key path is unresolved; production notification configuration is absent; user has no existing Firebase project. Actual attachments, Chinese voice and background delivery remain open. Production service remains the publisher's accepted929b984e until a separately verified release window; this work does not operate cloud/101/daily Mac.

## Next step

Primary Release C ABI passed21.36s with the same512KiB caller and original login/Host/Session flow; owned process cleanup independently checked. Finish second process-restart logout proof and UI-only Done/drag native retest, without creating another test identity. PR157 contains reviewed source; exact-head CI running. Incorporate current remote main deliberately after the cloud owner's serialized PR137 window; do not overwrite preserved8e902d6a or4e50be4b candidates or bypass CI.
