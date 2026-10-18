# Native account login on iPhone and Android

Task MOXBOTS-MOBILE-002. The installed iPhone signed and launched successfully, but the first account discovery failed (`OWNED_ACCOUNT_UNAVAILABLE`, connection category, 2ms). The attempted system authentication sheet did not meet the user requirement and is superseded by an ordinary native account/password form. It is not accepted as completed login.

The form uses the same MoXBots account as desktop. It never opens a browser or asks the user to enter the management console. It clears the password UI state on submission; passwords are transient in JavaScript/native memory and neither logged, persisted nor automatically retried. Session credentials, PKCE verifier and device identity remain in the original Rust/OS secure-store owner. The original protocol is extended only with the closed `account.login.password` intent. It validates fields, starts a server-verified Ready transaction, then consumes it through the existing proof-bound poll. An uncertain result does not replay the password.

`POST /auth/login/password` is an optional, default-off adapter to the original confidential Dex client and local password connector. It validates signed provider claims with a random nonce and retains the original issuer/sub to principal mapping, network and TTL. Provider secrets/tokens never enter the mobile app. Rate/concurrency limits and strict request/response bounds apply. See [service contract](../mobile-003-native-password-service.md). Running service configuration and deployment are independent required gates; no production capability is inferred from local tests. Existing browser login for other clients is preserved.

The iPhone additionally performs a bounded, credential-free, nonredirecting ephemeral HEAD to the configured instance endpoint using system networking. This gives iOS the opportunity to handle per-app network access before the Rust socket request, without relaxing TLS or creating a second identity authority. The cause of the original connection failure remains unconfirmed until actual phone retest. Password submission is gated again on actual foreground dispatch on both platforms.

## Desktop brand reuse

`mobile/app/assets/moxbots-mark.png`, Android adaptive foreground/monochrome and splash assets reuse the exact canonical `src/renderer/assets/brand/moxbots-icon.png`. The 1024px iOS icon is a deterministic resize/composite of that original mark on opaque white, with no shape redraw or generated alternative. Expo's generic artwork is no longer configured. The native login page uses the same mark. Native generated icon catalogs, installed launcher appearance and splash rendering require a fresh prebuild/package/reinstall.

## Acceptance status

- Before this change: development signing, real device installation, bundle/version readback and process launch passed. Real login failed and is retained as evidence.
- Native password implementation: SDK116pass/1ignored +strictClippy; mobile typecheck/lint/policy55pass; service10targeted pass +strictClippy +193pass/7ignored full rerun with4threads. Original default-parallel notification25ms failure retained; no notification implementation/timeout changed. Independent source/UI review passed, rendered UI pending.
- Native password source CI passed: Test39139836079 and Owned AgentNet39139836136. The iOS simulator job is skipped. Freshly merged main changes require combined-head CI; no CI result substitutes for phone acceptance.
- Physical form, password verification, account persistence, Host session, voice and background notifications: not yet accepted.
- User explicitly authorized notifying/coordinating the existing scoped cloud deployment owner; concrete preparation request sent. Publication waits for final main/CI and the original owner's live policy/config/backup checks. This mobile task has not changed production or the user's daily desktop.

## Physical follow-up and native authorization confirmation

Source93d4ca40 was signed, installed, read back and launched on the original iPhone. Its native fields and desktop blue mark were observed; the user's password submission failed with MOBILE_INTENT_INVALID because the original C ABI ClosedIntent omitted account.login.password. The repair adds the typed variant and actual C ABI entry/owner validation regression (120 SDK tests pass, 1 ignored, strict Clippy); it does not turn the old installed candidate into accepted login.

Live read-only preparation found explicit Dex skipApprovalScreen=false. The prepared replacement shows an unchecked native permission for the same account identifier/name/email scope and an explicit 同意并登录 action. The UI resets consent on each submission and every client/ABI/service layer requires consentAccepted:true. This client assertion is not a Dex consent record and does not preserve one. The existing default-off service flag stays closed until the human explicitly approves this single-client native confirmation replacement and the sole cloud owner validates/publishes it. No skipApprovalScreen/MFA/IdP configuration is changed by this branch. See the precise service contract; production and real positive login remain unaccepted.

## Approved and installed correction

The corrected clean8e902d6a native libraries and app were signed and installed on the original iPhone. Actual submission now reaches the service's native-password-unavailable response. The canonical blue login mark, native fields, default-unchecked permission and button are visible and independently reviewed; true password verification remains blocked by the deliberately disabled service flag, not accepted as completed login.

The human explicitly approved the native same-client confirmation replacement and activation, subject to CI/main and the existing publisher's checks. The cloud owner verified that answer and found exactly one static client, no other static/dynamic clients, disabled gRPC and empty client MFAChain; original web approval remains false/unmodified. No further user confirmation is required within this exact scope. Actual isolated Dexv2.46 provider CI step passed in run39144231964; artifact and final combination checks remain distinct from production/phone SSO. All short-lived platform serialization copies are not explicitly zeroed; the promise is no password logging/persistence or automatic replay.
