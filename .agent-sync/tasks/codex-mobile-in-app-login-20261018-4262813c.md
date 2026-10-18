<!-- git-project-sync-task:version=1 -->
<!-- git-project-sync-task:branch=codex/mobile-in-app-login-20261018 -->
<!-- git-project-sync-task:base=96010acb710dfa864ddad979fe1d0b6dc49df69a -->
<!-- git-project-sync-task:status=in-progress -->

# Task: MOXBOTS-MOBILE-002: repair real iPhone login and present account sign-in inside app

## Objective

Continue MOXBOTS-MOBILE-002: repair the observed physical iPhone login failure and present existing authentication inside the app. Reuse the original account authority; no account switch or credential export. Internal phone installation is authorized; the existing scoped cloud owner handles the required optional service rollout.

## Acceptance criteria

- [x] Verify canonical main and preserve prior candidate.
- [ ] Inside-app login, cancellation, expiry and return recoverable.
- [ ] Physical network failure diagnosed/rechecked.
- [ ] Focused checks, independent review, signed phone install.
- [ ] CI, commit and remote main delivery.
- [ ] Real SSO/session list accepted or precise remaining user step recorded.
- Server deployment: required for native password login; queued with the existing scoped cloud owner. No production target writes by this task.

## Completed

- Previous candidate signed using existing account, installed and launched on real phone. Startup signed-out works; login click fails at discovery (connection category, 2 ms). Signing/install resolved; SSO not accepted.

## Verification

- project-sync observe/start/task-init pass at main96010acb. Current checks pending.

## Blockers and unknowns

- The new optional native password adapter is implemented and locally tested, but the running service/Dex configuration and real phone login are not yet accepted. Network permission cause remains a hypothesis until physical retest.
- Full remote, speech, notifications acceptance remains separate.

## Next step

- Focused checks/review, build, sign and install without deleting data; exercise actual login/cancel.

## User correction: native password form and desktop logo

The system authentication sheet was built/signed/installed but did not meet the actual requirement; it is superseded, not accepted. The user explicitly requires a native username/password form, no browser handoff or separate management-console login. Phone app/launcher/startup assets must reuse the desktop blue MoXBots logo.

- [x] RN native form, transient password cleared on submission, both-platform foreground gates, original Rust PKCE/Ready/poll/session path.
- [x] Existing Dex confidential-client password adapter, default-off, random nonce/original signed-claim validation, closed errors, bounded concurrency/rates. No duplicate user/password store.
- [x] Canonical desktop brand file reused; opaque1024px launcher icon exported, Android adaptive/default artwork replaced.
- [x] SDK116pass/1ignored +strictClippy; mobile typecheck/lint +policy55pass; independent source/UI review.
- [x] Backend final targeted10pass and strictClippy; full-service first run192pass/1fail/7ignored (unchanged25ms notification fixture did not receive request before timeout), bounded4-thread final rerun193pass/0fail/7ignored; unchanged25ms case passes both focused and in full rerun. Original failure retained.
- [ ] Fresh native framework/app/prebuild/sign/install and actual input/keyboard/return acceptance.
- [x] User approval and concrete deployment handoff sent to the existing cloud owner.
- [ ] Actual existing Dex private config, publication and real account verification. Committed bootstrap does not enable password grant. No production writes or account/identity changes performed by this task.
- [ ] Current CI, main delivery, real password sign-in/persistence/Host/voice/notification paths.

Scope dependency: existing cloud service deployment owner is01a12b99-7b38-78b1-831f-9c60257d386a. This task cannot independently deploy its code/config under the committed coordination policy. The user explicitly authorized notifying and coordinating that owner; the concrete release request has been sent, with preparation only until final main/CI proof.

## Native password candidate acceptance update

- Primary inspected final backend10case names/results and strictClippy log; native SDK116pass/1ignored and strictClippy passed.
- Backend final full service193pass/7ignored with4threads; no ignored live tests counted as acceptance. Source review crossed root/client and worker/service ownership.
- Independent UI source/typecheck/policy55 checks passed, but tool render unavailable in worker; root owns actual physical form/keyboard checks.
- Both iOS Rust device/simulator Release frameworks rebuilt from clean b77d85f2f inputs, native source provenance retained in external build tree. Actual app prebuild/sign/install pending.
- Cloud handoff request: publish this normally reviewed/CI-accepted service code via existing scoped owner01a12b99; review actual Dex local account/MFA/consent policy, preserve all user IDs/client secrets/issuer and existing grants, enable only original confidential local-password path plus service native_password_login, take original private backup/locks and verify same-principal native password login/poll/cancel before acceptance. Never rerun bootstrap or copy provider credentials to app. No production changes have occurred in this task.

## Coordinated delivery update

- Full CI passed for the native password/branding source (Test run39139836079 and Owned AgentNet run39139836136); iOS simulator CI is explicitly skipped, not counted as device acceptance.
- Fresh main311ecfd52 goal-pause changes were inspected and normally merged; they do not change mobile/shared-native/auth service inputs. Combined-head CI remains required before main delivery.
- iOS signed app and Android Release builds continue; the installed phone still has the superseded sheet candidate until the new native form is installed.
- The user reconfirmed the iPhone is unlocked and explicitly authorized coordinating cloud owner01a12b99-7b38-78b1-831f-9c60257d386a. The actual tool send succeeded. Owner was asked to inspect/prepare first, wait for final main/CI, preserve original identities/secrets/policies and follow its existing locks/backup/rollback. No production write by this task is implied.
- Next: finish incremental packages at the final reviewed source, strict signature/provenance and real form/keyboard checks, normal main delivery, then coordinate same-account service and iPhone authentication/persistence. Full Host, speech and notification acceptance remains separate.

## Physical native form, C ABI defect and explicit consent (19 Oct continuation)

- Signed source93d4ca40 installed/read back/launched on the original iPhone. Actual screen shows native username/password fields and the canonical blue desktop mark. The user could enter credentials, but submission returned MOBILE_INTENT_INVALID. This candidate is not accepted as working login.
- Root diagnosed a missing account.login.password variant in the original Rust C ABI ClosedIntent, before MobileConnection. Direct owner unit tests had not covered this entry. Added the closed typed variant, transient Zeroizing password DTO and actual mox_connection_new/request/free regression. Duplicate password/consent/version, missing and unknown fields remain rejected; the regression reaches original owner validation and proves no credential persistence. This is not a real signed-in positive path.
- Current local validation: SDK120pass/1ignored + strict all-target Clippy; mobile typecheck/lint/policy55pass; service13 focused consent/auth tests + strict Clippy/fmt. The earlier complete service193pass/7ignored precedes the consent amendment; current combined CI must rerun it. Independent end-to-end source review found no second native intent allowlist omission. Swift/Kotlin/JNI short-lived serialization copies are not all explicitly zeroed; no promise of all-memory zeroization is made.
- Cloud owner's real read-only inspection found Dexv2.46.0, original local password accounts/confidential client, no external connectors, native password flag absent/false, no passwordConnector and explicit skipApprovalScreen=false. Native password enablement therefore cannot silently bypass the existing authorization confirmation. No production writes occurred in this mobile task.
- Prepared original-scope native confirmation: default-unchecked account identifier/name/email permission, explicit 同意并登录, cleared per submission; Go requires the same selection. Required consentAccepted:true passes through RN/native/C ABI/owner/SDK/service. Missing/false is rejected before provider or Ready; this is a client assertion, not a preserved/created Dex consent record. The single-client replacement requires explicit human approval before publication. Existing cloud coordination authorization does not silently waive this gate; owner was instructed to keep the flag closed and preserve skipApprovalScreen/MFA/IdP.
- [x] Native form/desktop brand signed installation and user-observed input; failed password attempt retained as a defect, not acceptance.
- [x] C ABI routing repair, closed consent contract, focused tests and independent source review.
- [ ] Fresh C ABI/consent frameworks and signed app, actual phone retry/keyboard/consent.
- [ ] Explicit human approval of the concrete native confirmation replacement; latest combined CI/main; sole-owner service rollout and real account/persistence/Host acceptance.

## Real Dex integration preparation

- Added an opt-in ignored integration test that uses the actual official Dexv2.46.0 binary, plus one loopback-only Linux Docker fixture script and an explicit existing owned-service CI step. The script fixes the local Unix engine, uses only generated synthetic identities/client secrets and temporary CA-only HTTPS, records the immutable image ID/digest/version, and cleans its named container/temp directory. No production configuration or remote Docker engine is used.
- Test contract: actual TLS discovery/JWKS/password token and nonce/issuer/audience/signature checks, original handler/PKCE poll one-time use, wrong password, cancellation and explicit test-only local transaction deadline advancement. Principal baseline is an independently verified real password-grant subject through original AuthStore, not an actual browser authorization-code or production-account comparison.
- Local new test compilation,13focused cases,strictClippy,fmt,shell/Python syntax and diff checks passed. The one real-Dex case remains ignored locally because no local daemon exists; only the explicit Linux CI step can supply real-provider acceptance. First compilation type failure is retained in the private log and not counted as success.
- Corrected device/simulator iOS and Android Rust frameworks built from the clean C ABI/consent source. New app packages are in progress; source93d on the phone still predates this repair. The initial iOS framework command omitted scoped DEVELOPER_DIR and failed before compilation; its log is retained, then the scoped Xcode environment rebuild passed without changing global developer selection.

## Installed bridge repair and approved native confirmation

- Clean source8e902d6a (C ABI repair + explicit consent) was rebuilt for iOS device/simulator and Android. Signed iPhone app installed/read back/launched; the actual user submission now reaches the original service and displays the fixed native-password-unavailable state, not MOBILE_INTENT_INVALID. Real credentials have still not been verified because production native login remains disabled. The original discovery/network failure is not separately diagnosed by this observation; the corrected path now reaches its service endpoint.
- Actual screenshot and independent rendered review confirm native fields, canonical blue login mark, default-unchecked consent and disabled-button layout with no visible obstruction on this iPhone. The user supplied input; root did not read or persist the password. Screenshot review does not prove small-phone keyboard, VoiceOver or real SSO. Native signature/build success does not substitute for these gates.
- Verified Android APK includes the exact clean native source/library hashes, original JNI dependency, AArch64 inventory,16KiB ELF/ZIP alignment and a valid internal test-key signature. No Android phone or store-signing acceptance is claimed.
- [x] The human explicitly approved: “允许，使用 App 内确认并启用”, answering the concrete same-client/default-unchecked/account identifier-name-email/no extra account permissions/other-client unchanged proposal. The cloud owner personally verified the original human answer. This approval and the earlier coordination approval have both been handed off; no duplicate confirmation is required.
- Cloud owner read-only scope evidence: one original static client, zero other static/dynamic clients, gRPC disabled, empty client MFAChain and no external connectors. Existing skipApprovalScreen remains false. This is not an invented per-client grantTypes setting; Dexv2.46's storage client has no such field. The existing sole publisher continues to preserve original identities/secrets/keys/TTL and waits for final main/CI/backup/rollout checks.
- Actual Dex fixture step passed in Owned run39144231964 at the native source860674f33; full workflow/artifact review was still finishing at this record. Final source includes subsequent documentation and independently reviewed main2e1c52273 session-continuation updates, without changing mobile/native/auth product inputs. Fresh combined CI remains the integration gate.
- External receipts retain source/digest/install/error distinctions and the superseded93d defect. Remaining: final combined CI and normal remote-main inclusion, serialized service activation, real phone account/persistence/Bot/Host acceptance. Full mobile speech/notifications remain separate.
